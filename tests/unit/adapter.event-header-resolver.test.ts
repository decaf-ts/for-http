import { AxiosHttpAdapter } from "../../src/axios";
import { HttpConfig } from "../../src";
import { HttpDispatcher } from "../../src/HttpDispatcher";
import { ServerEventConnector } from "../../src/event";
import { DecafHeaders } from "../../src/constants";

describe("HttpConfig.eventHeaderResolver", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const baseCfg: HttpConfig = {
    protocol: "http",
    host: "127.0.0.1:9999",
    eventsListenerPath: "/events",
    events: true,
  };

  describe("HttpAdapter.getEventHeaders", () => {
    it("returns {} when eventHeaderResolver is absent", async () => {
      const adapter = new AxiosHttpAdapter(
        { ...baseCfg },
        `eventheader-absent-${Math.random()}`
      );
      const headers = await (adapter as any).getEventHeaders();
      expect(headers).toEqual({});
    });

    it("invokes eventHeaderResolver (not the function object) and returns its record", async () => {
      const resolver = jest.fn(
        async () => ({ authorization: "Bearer abc" })
      );
      const adapter = new AxiosHttpAdapter(
        { ...baseCfg, eventHeaderResolver: resolver },
        `eventheader-record-${Math.random()}`
      );
      const headers = await (adapter as any).getEventHeaders();
      expect(resolver).toHaveBeenCalledTimes(1);
      expect(headers).toEqual({ authorization: "Bearer abc" });
    });
  });

  describe("HttpDispatcher delegation", () => {
    const contextual = () => ({
      log: {
        error: () => {},
        warn: () => {},
        info: () => {},
        debug: () => {},
        verbose: () => {},
        silly: () => {},
      },
      ctx: {},
      ctxArgs: [],
      for() {
        return this;
      },
    });

    it("includes eventHeaderResolver headers on the SSE stream open", async () => {
      const resolver = jest.fn(
        async () => ({ authorization: "Bearer abc" })
      );
      const adapter = new AxiosHttpAdapter(
        { ...baseCfg, eventHeaderResolver: resolver },
        `eventheader-sse-${Math.random()}`
      );
      (adapter as any).logCtx = jest.fn(() => contextual());
      const dispatcher = new HttpDispatcher() as any;
      dispatcher.initialized = true;
      dispatcher.adapter = adapter;

      let capturedHeadersCb: any;
      const connectorStub = {
        addListener: jest.fn(() => () => {}),
        ensureListening: jest.fn(() => Promise.resolve()),
        close: jest.fn(),
      };
      jest
        .spyOn(ServerEventConnector, "open")
        .mockImplementation((_url: string, headers?: any) => {
          capturedHeadersCb = headers;
          return connectorStub as any;
        });

      await dispatcher.startListening();

      const headers = await capturedHeadersCb();
      expect(resolver).toHaveBeenCalledTimes(1);
      expect(headers).toEqual(
        expect.objectContaining({ authorization: "Bearer abc" })
      );
    });

    it("includes eventHeaderResolver headers on the subscribe/unsubscribe POSTs", async () => {
      const resolver = jest.fn(
        async () => ({ authorization: "Bearer abc" })
      );
      const adapter = new AxiosHttpAdapter(
        {
          ...baseCfg,
          eventsSubscription: true,
          eventHeaderResolver: resolver,
        },
        `eventheader-subscribe-${Math.random()}`
      );
      (adapter as any).observerHandler = {
        observers: [{ observer: { class: "TestModel" } }],
      };
      const dispatcher = new HttpDispatcher() as any;
      dispatcher.initialized = true;
      dispatcher.adapter = adapter;

      const fetchMock = jest
        .spyOn(globalThis, "fetch")
        .mockResolvedValue({
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => "",
        } as any);

      await dispatcher.syncSubscriptions(true);

      const subscribeCall = fetchMock.mock.calls.find(([url]) =>
        String(url).includes("/subscribe")
      );
      expect(subscribeCall).toBeDefined();
      const [, init] = subscribeCall!;
      expect(init.headers).toEqual(
        expect.objectContaining({
          authorization: "Bearer abc",
          "Content-Type": "application/json",
          [DecafHeaders.CORRELATION_ID]: expect.any(String),
        })
      );
    });
  });
});
