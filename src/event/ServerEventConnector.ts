import { EventHandlers, ServerEvent, ServerRawMessage } from "./types";
import { EventSourceController, EventSourcePlus } from "event-source-plus";
import { Serialization } from "@decaf-ts/decorator-validation";
import { Context, ContextualLoggedClass } from "@decaf-ts/core";
import { InternalError } from "@decaf-ts/db-decorators";

export type ServerEventConnectorHeaders =
  | Record<string, string>
  | (() => Record<string, string> | Promise<Record<string, string>>);

/**
 * @description Reconnection policy of a {@link ServerEventConnector}
 * @summary Failed attempts (network errors, HTTP errors, streams rejected with an
 * SSE `error` event) back off exponentially from `reconnectDelayMs` up to
 * `maxReconnectDelayMs`; a healthy stream that ends cleanly reconnects after
 * `reconnectDelayMs`.
 * @typedef {Object} ServerEventConnectorOptions
 * @property {number} [reconnectDelayMs=1000] - Delay before the first reconnection
 * @property {number} [maxReconnectDelayMs=30000] - Upper bound for the delay
 * @memberOf module:for-http
 */
export type ServerEventConnectorOptions = {
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
};

type OpenWaiter = {
  resolve: () => void;
  reject: (reason?: unknown) => void;
};

/**
 * @description Shared Server-Sent Events connection for a URL
 * @summary Opens (at most) one SSE stream per URL, fans its events out to the
 * registered listeners and owns reconnection: event-source-plus' own retrying is
 * disabled (it resets its back-off on every `200` and re-opens a stream that was
 * closed while waiting to retry), so failures back off here and nothing reconnects
 * once the connector is closed. A stream answered with an HTTP error, or accepted
 * and then rejected with an SSE `error` event (how NestJS reports an exception
 * raised by an `@Sse()` handler), is reported to the listeners' `onError`.
 * @class ServerEventConnector
 * @memberOf module:for-http
 */
export class ServerEventConnector extends ContextualLoggedClass<Context<any>> {
  private static readonly cache = new Map<string, ServerEventConnector>();

  /** policy used when {@link ServerEventConnector.open} is given none */
  static defaults: Required<ServerEventConnectorOptions> = {
    reconnectDelayMs: 1000,
    maxReconnectDelayMs: 30000,
  };

  static get(url: string): ServerEventConnector {
    if (this.cache.has(url)) return this.cache.get(url) as ServerEventConnector;

    throw new InternalError(
      `Server event connector not found for URL '${url}'. Did you forget to call open()?`
    );
  }

  static open(
    url: string,
    headers?: ServerEventConnectorHeaders,
    options?: ServerEventConnectorOptions
  ): ServerEventConnector {
    if (this.cache.has(url)) return this.cache.get(url) as ServerEventConnector;

    const connector = new ServerEventConnector(url, headers, options);
    this.cache.set(url, connector);
    return connector;
  }

  static close(url: string): void {
    if (this.cache.has(url)) {
      const connector = this.cache.get(url) as ServerEventConnector;
      connector.close();
    }
  }

  private static parseReceivedEvent(raw: unknown): ServerEvent<any> | null {
    const deserializePayload = (value: unknown): any => {
      if (typeof value !== "string") return value;
      try {
        return Serialization.deserialize(value);
      } catch {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
    };
    try {
      const data = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!Array.isArray(data) || data.length < 3) return null;

      const [eventName, operationKey, objectId, rawPayload] = data;
      if (typeof eventName !== "string") return null;

      let payload: Record<string, any> | Array<Record<string, any>>;
      if (Array.isArray(rawPayload)) {
        payload = rawPayload.map((item) => deserializePayload(item));
      } else {
        payload = deserializePayload(rawPayload);
      }
      return [eventName, String(operationKey), objectId, payload] as const;
    } catch {
      return null;
    }
  }

  private es?: EventSourcePlus;
  private controller?: EventSourceController;
  private readonly policy: Required<ServerEventConnectorOptions>;
  private listeners: Set<EventHandlers> = new Set();
  private waiters: OpenWaiter[] = [];
  private ready = false;
  private closed = false;
  /** consecutive failed attempts, drives the back-off */
  private failures = 0;
  /** whether the current attempt failed (HTTP error, `error` event, network) */
  private attemptFailed = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly url: string,
    private readonly headers?: ServerEventConnectorHeaders,
    options?: ServerEventConnectorOptions
  ) {
    super();
    this.policy = {
      reconnectDelayMs:
        options?.reconnectDelayMs ??
        ServerEventConnector.defaults.reconnectDelayMs,
      maxReconnectDelayMs:
        options?.maxReconnectDelayMs ??
        ServerEventConnector.defaults.maxReconnectDelayMs,
    };
  }

  /** whether a stream was created (it may be reconnecting) */
  isOpen(): boolean {
    return this.es !== undefined;
  }

  /** whether the stream is currently established */
  isConnected(): boolean {
    return this.ready;
  }

  protected async getHeaders(): Promise<Record<string, string>> {
    let headers = this.headers;

    if (typeof this.headers == "function") {
      headers = await Promise.resolve(this.headers());
    }

    return (headers as Record<string, string>) || {};
  }

  close(force: boolean = false): void {
    const log = this.log.for(this.close);

    if (this.listeners.size > 0 && !force) {
      log.warn(
        `Skipping EventSource connection close ${this.url} — ${this.listeners.size} active listener(s) remaining.`
      );
      return;
    }

    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const controller = this.controller;
    this.controller = undefined;
    this.es = undefined;
    this.ready = false;
    this.listeners.clear();
    this.settleWaiters(new InternalError(`Connection to ${this.url} closed`));
    if (ServerEventConnector.cache.get(this.url) === this)
      ServerEventConnector.cache.delete(this.url);

    if (!controller) {
      log.debug(`Closed EventSource connector for ${this.url} (never opened)`);
      return;
    }
    log.info(`Closing EventSource connection for listening URL ${this.url}`);
    try {
      controller.abort();
    } finally {
      log.info(
        `EventSource connection ${this.url} closed and removed from pool`
      );
    }
  }

  private settleWaiters(error?: unknown): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) {
      if (error) waiter.reject(error);
      else waiter.resolve();
    }
  }

  private notifyError(error: unknown): void {
    for (const handler of [...this.listeners]) {
      try {
        handler.onError(error);
      } catch (err: unknown) {
        this.log
          .for(this.notifyError)
          .error(`Listener error handler failed: ${err}`);
      }
    }
  }

  /** marks the current attempt as failed, fails pending waiters, tells listeners */
  private fail(error: unknown): void {
    this.ready = false;
    if (this.attemptFailed) return;
    this.attemptFailed = true;
    this.settleWaiters(error);
    this.notifyError(error);
  }

  private scheduleReconnect(): void {
    if (this.closed || !this.controller || this.reconnectTimer) return;
    const log = this.log.for(this.scheduleReconnect);
    if (this.attemptFailed) this.failures++;
    else this.failures = 0;
    const base = Math.min(
      this.policy.maxReconnectDelayMs,
      this.policy.reconnectDelayMs * 2 ** Math.max(0, this.failures - 1)
    );
    // up to 20% jitter so clients don't reconnect in lockstep after a restart
    const delay = Math.round(base * (1 + Math.random() * 0.2));
    log.info(
      `EventSource ${this.url} ${this.attemptFailed ? "failed" : "ended"}; reconnecting in ${delay}ms`
    );
    const controller = this.controller;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.closed || this.controller !== controller) return;
      this.attemptFailed = false;
      controller.reconnect();
    }, delay);
  }

  private connect(): void {
    const log = this.log.for(this.connect);
    log.info(`Opening EventSource connection to ${this.url}`);
    this.attemptFailed = false;
    this.es = new EventSourcePlus(this.url, {
      // evaluated on every (re)connection, so refreshed tokens are picked up
      headers: () => this.getHeaders(),
      credentials: "include",
      // reconnection is handled by scheduleReconnect()
      retryStrategy: "on-error",
      maxRetryCount: 1,
    });

    const controller = this.es.listen({
      onResponse: ({ response }) => {
        if (this.controller !== controller) return;
        if (!response.ok) return; // reported by onResponseError
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("text/event-stream")) return;
        this.ready = true;
        log.info(`Connected to ${this.url}. Ready to receive events`);
        this.settleWaiters();
        for (const handler of [...this.listeners]) {
          try {
            handler.onOpen?.();
          } catch (err: unknown) {
            log.error(`Listener open handler failed: ${err}`);
          }
        }
      },
      onRequestError: ({ error }) => {
        if (this.controller !== controller) return;
        log.error("Failed to establish EventSource connection", {
          url: this.url,
          error: String((error as any)?.message ?? error),
        });
        this.fail(
          new InternalError(
            `Failed to connect to ${this.url}: ${(error as any)?.message ?? error}`
          )
        );
      },
      onResponseError: ({ response, error }) => {
        if (this.controller !== controller) return;
        const status = response?.status;
        log.error("Listening failed with HTTP error response", {
          url: this.url,
          status,
          statusText: response?.statusText,
        });
        this.fail(
          new InternalError(
            status && status >= 400
              ? `HTTP ${status} ${response?.statusText ?? "error"}`
              : `Invalid event stream from ${this.url}: ${(error as any)?.message ?? error}`
          )
        );
      },
      onMessage: (message: ServerRawMessage) => {
        if (this.controller !== controller) return;
        if (message.event === "heartbeat") {
          log.debug(`Refresh connection. Heartbeat received.`);
          return;
        }
        if (message.event === "error") {
          log.error(`Server rejected the event stream: ${message.data}`, {
            url: this.url,
          });
          this.fail(new InternalError(message.data || "Event stream error"));
          return;
        }

        const raw =
          message && typeof message === "object" && "data" in message
            ? message.data
            : message;

        const event = ServerEventConnector.parseReceivedEvent(raw);
        if (!event) {
          log.warn(`Failed to parse SSE message`, {
            url: this.url,
            raw,
          });
          return;
        }

        for (const handler of [...this.listeners]) {
          try {
            handler.onEvent(event);
          } catch (err) {
            log.error("Listener handler failed on event", { err });
          }
        }
      },
    });
    this.controller = controller;
    controller.onAbort((event) => {
      if (this.controller !== controller || event.type === "manual") return;
      if (event.type === "error")
        this.fail(new InternalError(`Event stream error: ${event.reason ?? ""}`));
      this.ready = false;
      this.scheduleReconnect();
    });
  }

  /**
   * @description Waits for the shared stream to be established
   * @summary Opens the stream when needed and resolves once the server accepted
   * it. Rejects when that attempt fails; the connector keeps reconnecting in the
   * background until it is closed.
   * @return {Promise<void>}
   */
  async ensureListening(): Promise<void> {
    if (this.closed)
      throw new InternalError(`Connection to ${this.url} is closed`);
    if (this.ready) return;
    const opened = new Promise<void>((resolve, reject) =>
      this.waiters.push({ resolve, reject })
    );
    if (!this.controller) this.connect();
    return opened;
  }

  addListener(handlers: EventHandlers): () => void {
    const log = this.log.for(this.addListener);
    log.info(
      `Registering listener for connection ${this.url} — ${this.listeners.size} active listener(s)`
    );

    this.listeners.add(handlers);
    this.ensureListening().then(
      () =>
        log.info(
          `Listener registered for connection ${this.url} — total listener(s): ${this.listeners.size}`
        ),
      (error: unknown) =>
        log.warn(
          `Connection ${this.url} not established yet (${error}); retrying in the background`
        )
    );
    return () => this.removeListener(handlers);
  }

  removeListener(handlers: EventHandlers): void {
    const log = this.log.for(this.removeListener);
    const existed = this.listeners.has(handlers);

    log.info(
      `Unregistering listener for connection ${this.url}. Current active listeners: ${this.listeners.size}`,
      {
        listenerFound: existed,
      }
    );

    if (existed) {
      this.listeners.delete(handlers);
      log.debug(
        `Listener unregistered for connection ${this.url} — total listener(s): ${this.listeners.size}`
      );
    }

    if (this.listeners.size === 0) {
      log.info(
        `No listeners remaining. Closing EventSource connection ${this.url}.`,
        {
          url: this.url,
          listeners: this.listeners.size,
        }
      );
      this.close();
    }
  }
}
