import {
  Adapter,
  Context,
  ContextualArgs,
  Dispatch,
  MaybeContextualArg,
  PersistenceKeys,
  PreparedStatement,
} from "@decaf-ts/core";
import { ServerEvent, ServerEventConnector } from "./event";
import { HttpConfig, HttpFlags } from "./types";
import { InternalError } from "@decaf-ts/db-decorators";

export class HttpDispatcher extends Dispatch<
  Adapter<HttpConfig, any, PreparedStatement<any>, Context<HttpFlags>>
> {
  private connector?: ServerEventConnector;

  protected override initialized = false;
  private listening = false;

  /**
   * Called by the base Dispatch after observe(adapter).
   * We patch the Adapter's internal ObserverHandler to track how many observers exist.
   */
  protected override async initialize(
    ...args: MaybeContextualArg<any>
  ): Promise<void> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PersistenceKeys.INITIALIZATION, true)
    ).for(this.initialize);

    if (!this.adapter) {
      // Gracefully skip initialization when no adapter is observed yet.
      // Some tests or setups may construct a Dispatch before calling observe().
      // Instead of throwing, we no-op so that later observe() can proceed.
      log.verbose(`No adapter observed for dispatch; skipping initialization`);
      return;
    }

    log.info(
      `Initializing ${this.adapter}'s event Dispatch, but not listening yet.`
    );
    this.initialized = true;
    await this.startListening(...ctxArgs);

    log.info(`HttpDispatcher initialized for adapter ${this.adapter}.`);
  }

  /**
   * Enables the dispatcher. SSE will only open and start to listening for events if there is at least one observer.
   */
  async startListening(...args: ContextualArgs<any>): Promise<void> {
    const { log } = this.logCtx(args, this.startListening);
    if (!this.initialized || !this.adapter) {
      log.error(
        `Cannot start listening: dispatcher is not initialized or adapter is missing`,
        {
          initialized: this.initialized,
          hasAdapter: !!this.adapter,
        }
      );
      throw new Error("Cannot start listening before call initialize()");
    }

    const conf = this.adapter.config as HttpConfig;

    if (!conf.events) {
      log.warn("SSe events disabled");
      return;
    }
    if (this.listening) {
      log.warn(`startListening called but dispatcher is already listening`, {
        adapter: String(this.adapter),
      });
    }

    const { protocol, host, eventsListenerPath } = this.adapter
      .config as HttpConfig;

    if (!eventsListenerPath) {
      log.error(`Cannot start listening: no eventsListenerPath specified`, {
        protocol,
        host,
      });
      throw new Error("No eventsListenerPath specified");
    }

    const listeningUrl = new URL(
      eventsListenerPath,
      `${protocol}://${host}`
    ).toString();

    log.info(`Opening ServerEventConnector for url: ${listeningUrl}`);
    this.connector = ServerEventConnector.open(listeningUrl, async () => {
      if (!this.adapter) throw new InternalError("Adapter not initialized");
      try {
        return (this.adapter as any).getEventHeaders();
      } catch (e: unknown) {
        throw new InternalError(`Failed to get event headers: ${e}`);
      }
    });

    log.debug(
      `ServerEventConnector opened successfully for url: ${listeningUrl}`
    );
    this.connector.addListener({
      onEvent: async (event: ServerEvent<any>) => {
        const [tableName, operation, id, ...args] = event;
        const { log, ctxArgs } = (await this.logCtx(args, operation, true)).for(
          "onEvent"
        );

        super
          .updateObservers(
            tableName,
            operation,
            id,
            ...(ctxArgs as [...any[], Context<HttpFlags>])
          )
          .catch((e) =>
            log.error(`ServerEventConnector failed to updateObservers`, e)
          );
      },
      onError: (e: any) => {
        log.error(`ServerEventConnector failed to dispatch event`, {
          error: e,
          listeningUrl,
          adapter: String(this.adapter),
        });
      },
    });

    this.listening = true;
    log.info(`HttpDispatcher is now listening at ${listeningUrl}.`);
  }

  override async close(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: ContextualArgs<Context<HttpFlags>>
  ): Promise<void> {
    // const { log } = this.logCtx(args, this.close);
    //
    // log.debug(`Closing HttpDispatcher`, {
    //   hasConnector: !!this.connector,
    //   listening: this.listening,
    //   initialized: this.initialized,
    //   adapter: this.adapter ? String(this.adapter) : undefined,
    // });

    this.connector?.close(true);
    this.listening = false;
  }
}
