import { EventHandlers, ServerEvent } from "./types";
import { EventSourcePlus } from "event-source-plus";
import { Serialization } from "@decaf-ts/decorator-validation";

export class ServerEventConnector {
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

  constructor(private readonly url: string) {}

  isOpen(): boolean {
    return this.es !== undefined;
  }

  close(): void {
    if (!this.es) return;

    if (this.listeners.size > 0) return;

    // Close and drop from cache.
    try {
      this.controller?.abort();
    } finally {
      this.controller = undefined;
      this.es = undefined;
      this.listeners.clear();
      ServerEventConnector.cache.delete(this.url);
      console.log(`EventSourcePlus close for ${this.url}`);
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
    if (this.es) return; // already listening. TODO: Add log

    const url = this.url;

    this.es = new EventSourcePlus(url, {
      headers,
      credentials: "include",
    });

    this.controller = this.es.listen({
      onResponse: () => {
        console.log("EventSourcePlus connected");
      },
      onRequestError: ({ error }) => {
        console.log("EventSourcePlus request error:", error);
        handlers.onError(String((error as any)?.message ?? error));
      },
      onResponseError: ({ response }) => {
        console.log("EventSourcePlus response error:", response);
        handlers.onError(`HTTP ${response.status}`);
      },
      onMessage: (message: any) => {
        const raw =
          message && typeof message === "object" && "data" in message
            ? message.data
            : message;

        const event = ServerEventConnector.parseReceivedEvent(raw);
        if (!event) return;
        handlers.onEvent(event);
      },
    });

    setInterval(() => {
      this.close();
    }, 30000);
  }

  private addListener(handlers: EventHandlers): void {
    this.listeners.add(handlers);
  }

  private removeListener(handlers: EventHandlers): void {
    this.listeners.delete(handlers);
  }
}
