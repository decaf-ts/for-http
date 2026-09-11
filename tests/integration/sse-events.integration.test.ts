/**
 * SSE client (HttpAdapter / HttpDispatcher / ServerEventConnector) against a
 * server reproducing for-nest's events wire behaviour — see SseTestServer.
 */
import { AxiosHttpAdapter } from "../../src/axios";
import { ServerEventConnector } from "../../src/event";
import type { HttpConfig } from "../../src/types";
import { SseTestServer, delay, waitFor } from "./helpers/SseTestServer";

jest.setTimeout(30000);

const RECONNECT = { delayMs: 200, maxDelayMs: 800 };

class Probe {}
class Other {}

type RecordingObserver = {
  class: unknown;
  events: string[];
  refresh: (...args: any[]) => Promise<void>;
};

function recordingObserver(cls: unknown = Probe): RecordingObserver {
  const events: string[] = [];
  return {
    class: cls,
    events,
    refresh: async (table: any, operation: any, id: any) => {
      events.push(`${typeof table === "string" ? table : table?.name}:${operation}:${id}`);
    },
  };
}

let aliasSeq = 0;

const openConnectors = (): string[] => [
  ...((ServerEventConnector as any).cache as Map<string, unknown>).keys(),
];

describe("for-http SSE client against a for-nest-like events server", () => {
  let server: SseTestServer;
  const adapters: AxiosHttpAdapter[] = [];
  const connectors: ServerEventConnector[] = [];

  const adapterFor = (config: Partial<HttpConfig> & Record<string, any> = {}) => {
    const adapter = new AxiosHttpAdapter(
      {
        protocol: "http",
        host: server.host,
        eventsListenerPath: "/events",
        eventsReconnect: RECONNECT,
        ...config,
      } as HttpConfig,
      `sse-it-${++aliasSeq}`
    );
    adapters.push(adapter);
    return adapter;
  };

  const connectorFor = (headers?: Record<string, string>) => {
    const connector = (ServerEventConnector.open as any)(
      `http://${server.host}/events`,
      headers,
      { reconnectDelayMs: RECONNECT.delayMs, maxReconnectDelayMs: RECONNECT.maxDelayMs }
    ) as ServerEventConnector;
    connectors.push(connector);
    return connector;
  };

  beforeEach(async () => {
    server = new SseTestServer();
    await server.start();
  });

  afterEach(async () => {
    await Promise.all(adapters.splice(0).map((a) => a.shutdown().catch(() => undefined)));
    connectors.splice(0).forEach((c) => c.close(true));
    jest.restoreAllMocks();
    await server.close();
    // a connector left open would keep reconnecting after the test run
    expect(openConnectors()).toEqual([]);
  });

  describe("headers", () => {
    it("sends the eventHeaderResolver headers on the stream (broadcast mode)", async () => {
      const adapter = adapterFor({
        eventHeaderResolver: () => ({ authorization: "Bearer broadcast-token" }),
      });
      adapter.observe(recordingObserver() as any);
      expect(await waitFor(() => server.streams.size === 1)).toBe(true);
      expect(server.streamRequests()[0].headers.authorization).toBe("Bearer broadcast-token");
    });

    it("keeps the resolver headers on the stream and on subscribe in subscription mode", async () => {
      const adapter = adapterFor({
        eventsSubscription: true,
        eventHeaderResolver: () => ({ authorization: "Bearer sub-token" }),
      });
      adapter.observe(recordingObserver() as any);
      expect(await waitFor(() => server.streams.size === 1)).toBe(true);

      const [subscribe] = server.posts("/events/subscribe");
      const [stream] = server.streamRequests();
      expect(subscribe.headers.authorization).toBe("Bearer sub-token");
      expect(stream.headers.authorization).toBe("Bearer sub-token");
      expect(stream.headers["x-correlation-id"]).toBeDefined();
      expect(subscribe.headers["x-correlation-id"]).toBe(stream.headers["x-correlation-id"]);
      expect(JSON.parse(subscribe.body)).toEqual({ topics: ["Probe.*"] });
    });

    it("ignores non-string header values returned by the resolver", async () => {
      const adapter = adapterFor({
        eventHeaderResolver: () => ({ authorization: "Bearer t", nested: { a: 1 } }) as any,
      });
      adapter.observe(recordingObserver() as any);
      expect(await waitFor(() => server.streams.size === 1)).toBe(true);
      expect(server.streamRequests()[0].headers.nested).toBeUndefined();
    });
  });

  describe("subscribe/unsubscribe endpoints", () => {
    it("are resolved against the listener path even when it carries a query string", async () => {
      const adapter = adapterFor({
        eventsListenerPath: "/events?tenant=a",
        eventsSubscription: true,
      });
      const stop = adapter.observe(recordingObserver() as any);
      expect(await waitFor(() => server.streams.size === 1)).toBe(true);
      expect(server.posts("/events/subscribe")).toHaveLength(1);

      stop();
      expect(await waitFor(() => server.posts("/events/unsubscribe").length === 1)).toBe(true);
      expect(server.requests.filter((r) => r.path === "/subscribe" || r.path === "/unsubscribe")).toEqual([]);
    });

    it("are sent with credentials, like the stream, so cookie-based auth reaches them", async () => {
      const fetchSpy = jest.spyOn(globalThis, "fetch");
      const adapter = adapterFor({ eventsSubscription: true });
      adapter.observe(recordingObserver() as any);
      expect(await waitFor(() => server.posts("/events/subscribe").length === 1)).toBe(true);

      const subscribeCall = fetchSpy.mock.calls.find(([url]) => String(url).endsWith("/events/subscribe"));
      expect(subscribeCall?.[1]).toEqual(expect.objectContaining({ credentials: "include" }));
    });
  });

  describe("failures and reconnection", () => {
    it("reports a stream rejected with an SSE error event and backs off", async () => {
      server.mode = "reject";
      const errors: unknown[] = [];
      const connector = connectorFor();
      connector.addListener({ onEvent: () => undefined, onError: (e) => errors.push(e) });

      await delay(1500);
      expect(String(errors[0])).toContain("ConflictError");
      // 200ms, 400ms, 800ms back-off: at most ~4 attempts in 1.5s (not hundreds)
      expect(server.streamRequests().length).toBeLessThanOrEqual(5);
    });

    it("does not report an HTTP error response as connected and backs off", async () => {
      server.mode = "status";
      server.status = 502;
      const errors: unknown[] = [];
      const connector = connectorFor();
      connector.addListener({ onEvent: () => undefined, onError: (e) => errors.push(e) });

      await expect(connector.ensureListening()).rejects.toThrow(/502/);
      await delay(1500);
      expect(errors.length).toBeGreaterThan(0);
      expect(server.streamRequests().length).toBeLessThanOrEqual(5);
    });

    it("recovers once the server accepts the stream again", async () => {
      server.mode = "status";
      const adapter = adapterFor();
      const observer = recordingObserver();
      adapter.observe(observer as any);
      await waitFor(() => server.streamRequests().length >= 1);

      server.mode = "ok";
      expect(await waitFor(() => server.streams.size === 1, 3000)).toBe(true);
      server.emit("Probe", "create", "p-1");
      expect(await waitFor(() => observer.events.length === 1)).toBe(true);
    });

    it("stops reconnecting once closed — no orphaned stream is opened afterwards", async () => {
      server.mode = "reject";
      const connector = connectorFor();
      connector.addListener({ onEvent: () => undefined, onError: () => undefined });
      await waitFor(() => server.streamRequests().length >= 1);
      await delay(100);

      connector.close(true);
      const attempts = server.streamRequests().length;
      server.mode = "ok"; // an orphaned retry would now connect and stay open
      await delay(1200);
      expect(server.streamRequests().length).toBe(attempts);
      expect(server.streams.size).toBe(0);
    });

    it("reconnects after the server ends the stream and re-syncs its subscriptions", async () => {
      const adapter = adapterFor({ eventsSubscription: true });
      const observer = recordingObserver();
      adapter.observe(observer as any);
      expect(await waitFor(() => server.streams.size === 1)).toBe(true);
      expect(server.posts("/events/subscribe")).toHaveLength(1);

      server.endStreams(); // e.g. a backend restart: subscriptions are gone server-side
      expect(await waitFor(() => server.streamRequests().length === 2 && server.streams.size === 1, 3000)).toBe(true);
      expect(await waitFor(() => server.posts("/events/subscribe").length === 2)).toBe(true);

      server.emit("Probe", "update", "p-2");
      expect(await waitFor(() => observer.events.length === 1)).toBe(true);
    });
  });

  describe("adapter shutdown and re-initialization", () => {
    it.each([false, true])(
      "shutdown closes the stream and nothing reconnects afterwards (subscription mode: %s)",
      async (eventsSubscription) => {
        const adapter = adapterFor({ eventsSubscription });
        adapter.observe(recordingObserver() as any);
        expect(await waitFor(() => server.streams.size === 1)).toBe(true);

        await adapter.shutdown();
        expect(openConnectors()).toEqual([]);
        expect(await waitFor(() => server.streams.size === 0)).toBe(true);
        if (eventsSubscription) expect(server.posts("/events/unsubscribe")).toHaveLength(1);

        const attempts = server.streamRequests().length;
        await delay(800);
        expect(server.streamRequests()).toHaveLength(attempts);
      }
    );

    it("shutdown waits for a session still subscribing, which never connects and withdraws its subscription", async () => {
      server.subscribeDelayMs = 300;
      const adapter = adapterFor({ eventsSubscription: true });
      adapter.observe(recordingObserver() as any);
      // the subscribe request reached the server; its response is still pending
      expect(await waitFor(() => server.posts("/events/subscribe").length === 1)).toBe(true);
      const cid = server.posts("/events/subscribe")[0].headers["x-correlation-id"] as string;

      await adapter.shutdown();
      // nothing left in flight once shutdown resolved
      expect(server.subscriptions.has(cid)).toBe(false);
      expect(openConnectors()).toEqual([]);

      await delay(800);
      expect(server.streamRequests()).toEqual([]);
      expect(server.subscriptions.has(cid)).toBe(false);
    });

    it.each([false, true])(
      "leaves no stream behind when shut down right after observing (subscription mode: %s)",
      async (eventsSubscription) => {
        const adapter = adapterFor({ eventsSubscription });
        adapter.observe(recordingObserver() as any);
        await adapter.shutdown();
        expect(openConnectors()).toEqual([]);
        await delay(800);
        expect(server.streams.size).toBe(0);
        expect(openConnectors()).toEqual([]);
      }
    );

    it("stays closed after shutdown, even when observed, until initialized again", async () => {
      const adapter = adapterFor();
      const first = recordingObserver();
      adapter.observe(first as any);
      expect(await waitFor(() => server.streams.size === 1)).toBe(true);
      await adapter.shutdown();

      const second = recordingObserver();
      adapter.observe(second as any);
      await delay(600);
      expect(server.streamRequests()).toHaveLength(1);
      expect(server.streams.size).toBe(0);

      await adapter.initialize();
      expect(await waitFor(() => server.streams.size === 1)).toBe(true);
      server.emit("Probe", "create", "after-reinit");
      expect(await waitFor(() => first.events.length === 1 && second.events.length === 1)).toBe(true);
    });
  });

  describe("page navigation (last observer leaves, a new one arrives at once)", () => {
    it.each([false, true])(
      "keeps receiving events on the new session (subscription mode: %s)",
      async (eventsSubscription) => {
        server.enforceSubscriptions = eventsSubscription;
        // the closed session's unsubscribe returns after the new session subscribed
        server.unsubscribeDelayMs = 150;
        const adapter = adapterFor({ eventsSubscription });
        const first = recordingObserver();
        const stop = adapter.observe(first as any);
        expect(await waitFor(() => server.streams.size === 1)).toBe(true);

        stop();
        const second = recordingObserver();
        adapter.observe(second as any);
        // the closed session's stream goes away, the new one stays
        expect(await waitFor(() => server.streamRequests().length === 2 && server.streams.size === 1)).toBe(true);
        await delay(300); // let the closed session's unsubscribe land

        server.emit("Probe", "create", "after-navigation");
        expect(await waitFor(() => second.events.length === 1)).toBe(true);
        expect(second.events).toEqual(["Probe:create:after-navigation"]);
        expect(first.events).toEqual([]);
        if (eventsSubscription) {
          const [firstSession, secondSession] = server
            .streamRequests()
            .map((r) => r.headers["x-correlation-id"]);
          expect(secondSession).not.toBe(firstSession);
          const unsubscribed = server
            .posts("/events/unsubscribe")
            .map((r) => r.headers["x-correlation-id"]);
          expect(unsubscribed).toEqual([firstSession]);
        }
      }
    );
  });

  describe("delivery", () => {
    it("delivers every event exactly once, on shared and on separate streams", async () => {
      const shared = [adapterFor(), adapterFor()];
      const separate = adapterFor({ eventsListenerPath: "/events?client=separate" });
      const observers = [...shared, separate].map((adapter) => {
        const observer = recordingObserver();
        adapter.observe(observer as any);
        return observer;
      });
      const other = recordingObserver(Other);
      shared[0].observe(other as any);
      expect(await waitFor(() => server.streams.size === 2)).toBe(true);

      server.heartbeat();
      server.emit("Probe", "create", "a");
      server.emit("Probe", "update", "a");
      server.emit("Probe", "delete", "a");
      await waitFor(() => observers.every((o) => o.events.length >= 3));
      await delay(200);
      for (const observer of observers)
        expect(observer.events).toEqual(["Probe:create:a", "Probe:update:a", "Probe:delete:a"]);
    });
  });
});
