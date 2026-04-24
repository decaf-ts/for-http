import { HttpDispatcher } from "../../src/HttpDispatcher";
import { ServerEventConnector } from "../../src/event";

describe("HttpDispatcher.startListening", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("awaits connector readiness before resolving", async () => {
    const dispatcher = new HttpDispatcher() as any;
    dispatcher.initialized = true;
    const contextual = {
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
    };
    dispatcher.adapter = {
      config: {
        protocol: "http",
        host: "127.0.0.1:9999",
        eventsListenerPath: "/events",
        events: true,
      },
      getEventHeaders: jest.fn().mockResolvedValue({}),
      logCtx: () => contextual,
      toString: () => "test-http-adapter",
    };

    let resolveEnsure!: () => void;
    const ensureListening = new Promise<void>((resolve) => {
      resolveEnsure = resolve;
    });

    const connectorStub = {
      addListener: jest.fn(() => () => {}),
      ensureListening: jest.fn(() => ensureListening),
      close: jest.fn(),
    };

    jest
      .spyOn(ServerEventConnector, "open")
      .mockReturnValue(connectorStub as unknown as ServerEventConnector);

    let resolved = false;
    const start = dispatcher.startListening();
    start.then(() => {
      resolved = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolved).toBe(false);
    expect(connectorStub.addListener).toHaveBeenCalledTimes(1);
    expect(connectorStub.ensureListening).toHaveBeenCalledTimes(1);

    resolveEnsure();
    await start;
    expect(resolved).toBe(true);
    expect(dispatcher.listening).toBe(true);
  });
});
