import { EventHandlers, ServerEvent, ServerRawMessage } from "./types";
import { EventSourcePlus } from "event-source-plus";
import { Serialization } from "@decaf-ts/decorator-validation";
import { Context, ContextualLoggedClass } from "@decaf-ts/core";

export type ServerEventConnectorHeaders =
  | Record<string, string>
  | (() => Record<string, string> | Promise<Record<string, string>>);

export class ServerEventConnector extends ContextualLoggedClass<Context<any>> {
  private static readonly cache = new Map<string, ServerEventConnector>();

  static get(url: string): ServerEventConnector {
    if (this.cache.has(url)) return this.cache.get(url) as ServerEventConnector;

    throw new Error(
      `Server event connector not found for URL '${url}'. Did you forget to call open()?`
    );
  }

  static open(
    url: string,
    headers?: ServerEventConnectorHeaders
  ): ServerEventConnector {
    if (this.cache.has(url)) return this.cache.get(url) as ServerEventConnector;

    const connector = new ServerEventConnector(url, headers);
    this.cache.set(url, connector);
    return this.cache.get(url) as ServerEventConnector;
  }

  static close(url: string): void {
    if (this.cache.has(url)) {
      const connector = this.cache.get(url) as ServerEventConnector;
      connector.close();
    }
  }

  private static parseReceivedEvent(raw: unknown): ServerEvent<any> | null {
    try {
      const data = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!Array.isArray(data) || data.length < 3) return null;

      const [eventName, operationKey, objectId, rawPayload] = data;
      if (typeof eventName !== "string") return null;

      let payload: Record<string, any> | Array<Record<string, any>>;
      if (Array.isArray(rawPayload)) {
        payload = rawPayload.map((item) =>
          typeof item === "string" ? Serialization.deserialize(item) : item
        );
      } else {
        payload =
          typeof rawPayload === "string"
            ? Serialization.deserialize(rawPayload)
            : rawPayload;
      }
      return [eventName, String(operationKey), objectId, payload] as const;
    } catch {
      return null;
    }
  }

  /** Shared connection state (cached singleton instance). */
  private es?: EventSourcePlus;
  private controller?: { abort: () => void };
  private opening?: Promise<void>;
  private listeners: Set<EventHandlers> = new Set();

  constructor(
    private readonly url: string,
    private readonly headers?: ServerEventConnectorHeaders
  ) {
    super();
  }

  isOpen(): boolean {
    return this.es !== undefined;
  }

  protected async getHeaders() {
    let headers = this.headers;

    if (typeof this.headers == "function") {
      headers = await Promise.resolve(this.headers());
    }

    return headers || {};
  }

  close(force: boolean = false): void {
    const log = this.log.for(this.close);

    if (!this.es) {
      log.debug(
        `Skipping EventSource close — no open connection to ${this.url}`
      );
      return;
    }

    if (this.listeners.size > 0 && !force) {
      log.warn(
        `Skipping EventSource connection close ${this.url} — ${this.listeners.size} active listener(s) remaining.`
      );
      return;
    }

    // Close and drop from cache.
    try {
      log.info(`Closing EventSource connection for listening URL ${this.url}`);
      this.controller?.abort();
    } finally {
      this.controller = undefined;
      this.es = undefined;
      this.listeners.clear();
      ServerEventConnector.cache.delete(this.url);
      log.info(
        `EventSource connection ${this.url} closed and removed from pool`
      );
    }
  }

  /**
   * Increments refCount and ensures EventSource is created.
   * This method must be called only on the shared singleton instance.
   */
  private async startListening(): Promise<void> {
    const log = this.log.for(this.startListening);
    if (this.es) {
      log.info(
        `Listening address ${this.url} is already in the pool and listening. Skipping opening a new connection.`,
        { url: this.url, listeners: this.listeners.size }
      );
      return;
    }
    if (this.opening) {
      log.debug(`Connection open already in progress for ${this.url}`, {
        url: this.url,
        listeners: this.listeners.size,
      });
      await this.opening;
      return;
    }
    this.opening = (async () => {
      log.info(`Opening EventSource connection to ${this.url}`);
      const headers = await this.getHeaders();
      this.es = new EventSourcePlus(this.url, {
        ...(headers && { headers: headers }),
        credentials: "include",
      });

      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self: ServerEventConnector = this;
      this.controller = this.es.listen({
        onResponse: () => {
          log.info(`Connected to ${this.url}. Ready to receive events`);
        },
        onRequestError: ({ error }) => {
          log.error("Failed to establish EventSource connection", {
            url: this.url,
            error,
          });

          self.listeners.forEach((handler) =>
            handler.onError(String((error as any)?.message ?? error))
          );
        },
        onResponseError: ({ response }) => {
          const status = response?.status;
          const statusText = response?.statusText;
          log.error("Listening failed with HTTP error response", {
            url: this.url,
            status,
            statusText,
          });
          const err = new Error(
            `HTTP ${status ?? "unknown"} ${statusText ?? "error"}`
          );
          self.listeners.forEach((handler) => handler.onError(err));
        },
        onMessage: (message: ServerRawMessage) => {
          if (message.event === "heartbeat") {
            log.debug(`Refresh connection. Heartbeat received.`);
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

          for (const handler of self.listeners) {
            try {
              handler.onEvent(event);
            } catch (err) {
              log.error("Listener handler failed on event", { err });
            }
          }
        },
      });
    })().finally(() => {
      this.opening = undefined;
    });

    await this.opening;
  }

  addListener(handlers: EventHandlers): () => void {
    const log = this.log.for(this.addListener);
    log.info(
      `Registering listener for connection ${this.url} — ${this.listeners.size} active listener(s)`
    );

    this.listeners.add(handlers);
    this.startListening().then(() => {
      log.info(
        `Listener registered for connection ${this.url} — total listener(s): ${this.listeners.size}`
      );
    });
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
