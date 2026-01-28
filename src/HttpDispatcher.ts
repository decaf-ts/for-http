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

export class HttpDispatcher extends Dispatch<
  Adapter<HttpConfig, any, PreparedStatement<any>, Context<HttpFlags>>
> {
  private connector?: ServerEventConnector;

  private initialized = false;
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
  }

  /**
   * Enables the dispatcher. SSE will only open and start to listening for events if there is at least one observer.
   */
  async startListening(...args: ContextualArgs<any>): Promise<void> {
    if (!this.initialized || !this.adapter)
      throw new Error("Cannot start listening before call initialize()");

    const { log } = this.logCtx(args, this.startListening);
    // log.info(`Initializing event listener for adapter ${this.adapter}.`);

    const { protocol, host, eventsListenerPath } = this.adapter
      .config as HttpConfig;

    if (!eventsListenerPath) throw new Error("No eventsListenerPath specified");

    const listeningUrl = new URL(
      eventsListenerPath,
      `${protocol}://${host}`
    ).toString();
    this.connector = ServerEventConnector.open(listeningUrl);

    this.connector.startListening({
      onEvent: async (event: ServerEvent) => {
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
          .catch((e) => log.error(`Failed to dispatch SSE event`, e));
      },
      onError: (e: any) => log.error(e),
    });

    this.listening = true;
    log.info(
      `Initializing event listener for adapter ${this.adapter} at ${listeningUrl}.`
    );
  }

  override async close(): Promise<void> {
    this.connector?.close();
  }
}
