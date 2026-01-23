import { EventHandlers, ServerEvent } from "./types";
import { EventSource } from "eventsource";

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

      const [eventName, operationKey, objectId, payload] = data;
      if (typeof eventName !== "string") return null;

      return [eventName, String(operationKey), objectId, payload] as const;
    } catch {
      return null;
    }
  }

  /**
   * Shared connection state (cached singleton instance).
   */
  private es?: EventSource;
  private listeners: Set<EventHandlers> = new Set();

  constructor(private readonly url: string) {}

  /**
   * Returns whether this client instance is currently attached to the shared connection.
   * A shared connection may exist even if this specific instance is not open.
   */
  isOpen(): boolean {
    return this.es !== undefined;
  }

  close(): void {
    if (!this.es) return;

    if (this.listeners.size > 0) return;

    // Close and drop from cache.
    try {
      this.es?.close();
    } catch {
      // do nothing
    } finally {
      this.es = undefined;
      this.listeners.clear();
      ServerEventConnector.cache.delete(this.url);
    }
  }

  /**
   * Increments refCount and ensures EventSource is created.
   * This method must be called only on the shared singleton instance.
   */
  startListening(handlers: EventHandlers): void {
    if (this.es) return; // already listening. TODO: Add log

    const url = "http://127.0.0.1:3000/events";
    this.es = new EventSource(url, { withCredentials: true });

    this.es.onopen = () => {
      console.log("EventSource connected");
    };

    this.es!.onerror = (err: any) => {
      console.log("EventSource error:", err);
      // EventSource retries automatically by default. We intentionally do not throw.
      handlers.onError(err.message);
    };

    this.es!.onmessage = (ev: MessageEvent) => {
      const event = ServerEventConnector.parseReceivedEvent(ev.data);
      if (!event) return;
      handlers.onEvent(event);
    };
  }

  private addListener(handlers: EventHandlers): void {
    this.listeners.add(handlers);
  }

  private removeListener(handlers: EventHandlers): void {
    this.listeners.delete(handlers);
  }
}
