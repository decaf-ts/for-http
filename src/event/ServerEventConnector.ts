import { EventHandlers, ServerEvent, ServerRawMessage } from "./types";
import { EventSourcePlus } from "event-source-plus";
import { Serialization } from "@decaf-ts/decorator-validation";
import { Context, ContextualLoggedClass } from "@decaf-ts/core";

export class ServerEventConnector extends ContextualLoggedClass<Context<any>> {
  private static readonly cache = new Map<string, ServerEventConnector>();

  static get(url: string): ServerEventConnector {
    if (this.cache.has(url)) return this.cache.get(url) as ServerEventConnector;

    throw new Error(
      `Server event connector not found for URL '${url}'. Did you forget to call open()?`
    );
  }

  static open(url: string): ServerEventConnector {
    if (this.cache.has(url)) return this.cache.get(url) as ServerEventConnector;

    const connector = new ServerEventConnector(url);
    this.cache.set(url, connector);
    return this.cache.get(url) as ServerEventConnector;
  }

  static close(url: string): void {
    if (this.cache.has(url)) {
      const connector = this.cache.get(url) as ServerEventConnector;
      connector.close();
    }
  }

  private static parseReceivedEvent(raw: unknown): ServerEvent | null {
    try {
      const data = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!Array.isArray(data) || data.length < 3) return null;

      const [eventName, operationKey, objectId, rawPayload] = data;
      if (typeof eventName !== "string") return null;

      const payload =
        typeof rawPayload === "string"
          ? Serialization.deserialize(rawPayload)
          : rawPayload;

      return [eventName, String(operationKey), objectId, payload] as const;
    } catch {
      return null;
    }
  }

  /** Shared connection state (cached singleton instance). */
  private es?: EventSourcePlus;
  private controller?: { abort: () => void };

  private listeners: Set<EventHandlers> = new Set();

  constructor(private readonly url: string) {
    super();
  }

  isOpen(): boolean {
    return this.es !== undefined;
  }

  close(): void {
    const log = this.log.for(this.close);

    if (!this.es) {
      log.debug(
        `Skipping connector close because connector for ${this.url} is not open`
      );
      return;
    }

    if (this.listeners.size > 0) {
      log.warn(`Skipping connector close because still has active listeners`, {
        url: this.url,
        listeners: this.listeners.size,
      });
      return;
    }

    // Close and drop from cache.
    try {
      log.info(
        `ServerEventConnector closing event source connection for listening URL ${this.url}`
      );
      this.controller?.abort();
    } finally {
      this.controller = undefined;
      this.es = undefined;
      this.listeners.clear();
      ServerEventConnector.cache.delete(this.url);
      log.info(
        `ServerEventConnector closed connection and removed from active pool for URL ${this.url}`
      );
    }
  }

  /**
   * Increments refCount and ensures EventSource is created.
   * This method must be called only on the shared singleton instance.
   */
  startListening(
    handlers: EventHandlers,
    headers?:
      | Record<string, string>
      | (() => Record<string, string> | Promise<Record<string, string>>)
  ): void {
    const log = this.log.for(this.startListening);

    if (this.es) {
      log.info(`ServerEventConnector already in pool and listening`, {
        url: this.url,
        listeners: this.listeners.size,
      });
      return;
    }

    log.info(`Opening event source connection for ${this.url}`);
    this.es = new EventSourcePlus(this.url, {
      headers,
      credentials: "include",
    });

    this.controller = this.es.listen({
      onResponse: () => {
        log.info(`ServerEventConnector listening events from ${this.url}`);
      },
      onRequestError: ({ error }) => {
        log.error(`ServerEventConnector error on request`, {
          url: this.url,
          error,
        });
        handlers.onError(String((error as any)?.message ?? error));
      },
      onResponseError: ({ response }) => {
        log.error(`ServerEventConnector received an error response`, {
          url: this.url,
          status: response?.status,
          statusText: response?.statusText,
        });
        handlers.onError(
          `HTTP Error Response: ${response.status} ${response.statusText}`
        );
      },
      onMessage: (message: ServerRawMessage) => {
        if (message.event === "heartbeat") {
          log.warn(`Refresh connection. Heartbeat received.`);
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
        handlers.onEvent(event);
      },
    });
  }

  private addListener(handlers: EventHandlers): void {
    this.listeners.add(handlers);
  }

  private removeListener(handlers: EventHandlers): void {
    this.listeners.delete(handlers);
  }
}
