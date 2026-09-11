import {
  Adapter,
  Context,
  ContextualArgs,
  Dispatch,
  MaybeContextualArg,
  Observer,
  PersistenceKeys,
  PreparedStatement,
  UUID,
} from "@decaf-ts/core";
import { ServerEvent, ServerEventConnector } from "./event";
import { HttpConfig, HttpFlags } from "./types";
import { InternalError } from "@decaf-ts/db-decorators";
import { DecafHeaders } from "./constants";
import { HttpAdapter } from "./adapter";

/**
 * @description HTTP dispatch that streams adapter events over Server-Sent Events
 * @summary Bridges a {@link Dispatch} to an {@link HttpAdapter} by opening a
 * {@link ServerEventConnector} that listens on the adapter's events endpoint and
 * forwards each received event to the registered observers. In subscription mode it
 * also syncs the locally observed topics by subscribing/unsubscribing with the SSE
 * server, correlating each client through a `x-correlation-id` header
 * ({@link DecafHeaders.CORRELATION_ID}) so the server can scope subscriptions and
 * enforce a single connection per client.
 * @class HttpDispatcher
 * @extends Dispatch
 * @memberOf module:for-http
 * @mermaid
 * sequenceDiagram
 *   participant Dispatch as HttpDispatcher
 *   participant Adapter as HttpAdapter
 *   participant Connector as ServerEventConnector
 *   participant SSE as for-nest SSE server
 *   Dispatch->>Dispatch: initialize()
 *   Dispatch->>Adapter: startListening()
 *   Dispatch->>Dispatch: ensureCorrelationId()
 *   alt subscription mode
 *     Dispatch->>Dispatch: syncSubscriptions(true)
 *     Dispatch->>SSE: POST subscribe { topics } (x-correlation-id)
 *   end
 *   Dispatch->>Connector: ServerEventConnector.open(url)
 *   Connector-->>Dispatch: event
 *   Dispatch->>Adapter: updateObservers(table, operation, id, ...)
 *   Dispatch->>SSE: POST unsubscribe on close()
 */
export class HttpDispatcher extends Dispatch<
  Adapter<HttpConfig, any, PreparedStatement<any>, Context<HttpFlags>>
> {
  private connector?: ServerEventConnector;
  private removeConnectorListener?: () => void;
  private correlationId?: string;
  private subscriptionSync?: Promise<void>;
  private lastSubscriptionSignature?: string;

  protected override initialized = false;
  private listening = false;

  /**
   * @description Initializes the dispatcher for an adapter
   * @summary Called by the base {@link Dispatch} after `observe(adapter)`. Skips
   * initialization when no adapter has been observed yet, otherwise marks the
   * dispatcher as initialized and starts listening for events. The adapter's
   * internal observer handler is patched to track how many observers exist.
   * @param {...MaybeContextualArg} args - Contextual initialization arguments
   * @returns {Promise<void>} Resolves once the dispatcher is initialized
   */
  protected override async initialize(
    ...args: MaybeContextualArg<any>
  ): Promise<void> {
    const generation = this.currentGeneration();
    const { log, ctxArgs } = (
      await this.logCtx(args, PersistenceKeys.INITIALIZATION, true)
    ).for(this.initialize);
    if (this.isSuperseded(generation)) return;

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
   * @description Opens the SSE stream to the adapter's events endpoint
   * @summary Requires a prior {@link initialize} call and a configured
   * `eventsListenerPath`. Resolves the correlation id, optionally syncs the current
   * topic subscriptions, opens the {@link ServerEventConnector} and forwards observed
   * events to the adapter's observers. Events are disabled when `conf.events` is false.
   * @param {...ContextualArgs} args - Contextual start arguments
   * @throws {InternalError} When not initialized, when the adapter is missing or when no `eventsListenerPath` is configured
   * @mermaid
   * sequenceDiagram
   *   participant Dispatch as HttpDispatcher
   *   participant Adapter as HttpAdapter
   *   Dispatch->>Dispatch: startListening(args)
   *   opt conf.events === false
   *     Dispatch-->>Dispatch: warn "SSE events disabled", return
   *   end
   *   Dispatch->>Dispatch: ensureCorrelationId()
   *   alt subscription mode
   *     Dispatch->>Dispatch: syncSubscriptions(true)
   *   end
   *   Dispatch->>Dispatch: ServerEventConnector.open(subscribedUrl, headers)
   *   Dispatch->>Dispatch: ensureListening()
   *   Dispatch-->>Adapter: events forwarded to observers
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
      throw new InternalError(
        "Cannot start listening before call initialize()"
      );
    }

    const conf = this.adapter.config as HttpConfig;
    // close() (or the adapter's shutdown) may run while this session is still
    // starting (e.g. a page left right away); it must then not open a stream
    // nobody would ever close.
    const generation = this.currentGeneration();
    const closed = () => this.isSuperseded(generation);
    if (closed()) {
      log.warn(`Dispatch closed or adapter shut down; not listening for events`);
      return;
    }

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
      throw new InternalError("No eventsListenerPath specified");
    }

    const listeningUrl = new URL(
      eventsListenerPath,
      `${protocol}://${host}`
    ).toString();
    const adapter = this.adapter;
    const subscriptionMode = Boolean(conf.eventsSubscription);
    const correlationId = await this.ensureCorrelationId();
    if (closed()) return;
    const subscribedUrl = subscriptionMode
      ? this.appendQuery(listeningUrl, { cid: correlationId })
      : listeningUrl;

    let subscriptionsSynced = !subscriptionMode;
    if (subscriptionMode) {
      try {
        await this.syncSubscriptions(true);
        subscriptionsSynced = true;
      } catch (e: unknown) {
        // retried once the stream is established (see onOpen below)
        log.error(`Failed to sync SSE subscriptions before connecting: ${e}`);
      }
    }
    if (closed()) {
      log.debug(`Listening session closed while subscribing; not connecting`);
      // the session's unsubscribe may have reached the server before its subscribe
      await this.clearSubscriptionRegistration(adapter, correlationId);
      return;
    }

    log.info(`Opening ServerEventConnector for url: ${subscribedUrl}`);
    const reconnect = conf.eventsReconnect;
    this.connector = ServerEventConnector.open(
      subscribedUrl,
      async () => {
        if (!this.adapter) throw new InternalError("Adapter not initialized");
        let headers: Record<string, string> = {};
        try {
          headers = (await (this.adapter as any).getEventHeaders()) || {};
        } catch (e: unknown) {
          throw new InternalError(`Failed to get event headers: ${e}`);
        }
        if (subscriptionMode) {
          headers = {
            ...headers,
            [DecafHeaders.CORRELATION_ID]: correlationId,
          };
        }
        return headers;
      },
      reconnect
        ? {
            reconnectDelayMs: reconnect.delayMs,
            maxReconnectDelayMs: reconnect.maxDelayMs,
          }
        : undefined
    );

    log.debug(
      `ServerEventConnector opened successfully for url: ${subscribedUrl}`
    );
    this.removeConnectorListener?.();
    let opened = 0;
    this.removeConnectorListener = this.connector.addListener({
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
          listeningUrl: subscribedUrl,
          adapter: String(this.adapter),
        });
      },
      onOpen: () => {
        // the server may have lost the subscriptions (restart, other replica)
        // when the stream had to be re-established
        const resync = subscriptionMode && (opened++ > 0 || !subscriptionsSynced);
        if (!resync) return;
        subscriptionsSynced = true;
        this.syncSubscriptions(true).catch((e: unknown) =>
          log.error(`Failed to re-sync SSE subscriptions: ${e}`)
        );
      },
    });

    // Avoid races where writes happen before the SSE stream finishes connecting.
    try {
      await this.connector.ensureListening();
    } catch (e: unknown) {
      if (closed()) return;
      log.warn(
        `SSE stream to ${subscribedUrl} not established yet (${e}); reconnecting in the background`
      );
    }
    if (closed()) return;

    this.listening = true;
    log.info(`HttpDispatcher is now listening at ${subscribedUrl}.`);
  }

  /**
   * @description Serializes topic subscription syncs with the SSE server
   * @summary Runs {@link syncSubscriptionsInternal} exactly once per in-flight sync,
   * queuing additional calls until the current sync completes.
   * @param {boolean} [force=false] - When true, syncs even if the topics are unchanged
   * @returns {Promise<void>} Resolves when the queued sync completes
   */
  async syncSubscriptions(force = false): Promise<void> {
    if (this.subscriptionSync) {
      this.subscriptionSync = this.subscriptionSync.then(() =>
        this.syncSubscriptionsInternal(force)
      );
      return this.subscriptionSync;
    }
    this.subscriptionSync = this.syncSubscriptionsInternal(force).finally(
      () => {
        this.subscriptionSync = undefined;
      }
    );
    return this.subscriptionSync;
  }

  /**
   * @description Resolves or generates the correlation id of the listening session
   * @summary Generates a {@link UUID} once per listening session (a new one after
   * {@link close}), so the SSE server can correlate this client's subscriptions and
   * stream, and a late unsubscribe of a closed session never affects the next one.
   * @returns {Promise<string>} The session's correlation id
   */
  private async ensureCorrelationId(): Promise<string> {
    if (!this.correlationId) {
      this.correlationId = await Promise.resolve(UUID.instance.generate());
    }
    return this.correlationId;
  }

  private appendQuery(
    url: string,
    query: Record<string, string | undefined>
  ): string {
    const next = new URL(url);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) next.searchParams.set(key, value);
    }
    return next.toString();
  }

  /**
   * @description Collects the current webhook topics for all observed observers
   * @summary Walks the adapter's observer handler and derives one topic per observer
   * via {@link topicForObserver}, returning the deduplicated, sorted topic list.
   * @returns {string[]} The current subscription topics (possibly empty)
   */
  private currentSubscriptionTopics(): string[] {
    const adapter = this.adapter as any;
    const observers = adapter?.observerHandler?.observers;
    if (!Array.isArray(observers)) return [];

    const topics = new Set<string>();
    for (const entry of observers) {
      const observer = entry?.observer as Observer | undefined;
      if (!observer) continue;
      const topic = this.topicForObserver(observer);
      if (topic) topics.add(topic);
    }
    return [...topics].sort();
  }

  /**
   * @description Derives the webhook topic from an observed model observer
   * @summary Resolves the observed model name (its class, string table or constructor
   * name) and returns the `<model>.*` topic matching all events for that table.
   * Unknown observers resolve to undefined.
   * @param {Observer} observer - The observed model observer
   * @returns {string|undefined} The `<model>.*` topic, or undefined when unresolvable
   */
  private topicForObserver(observer: Observer): string | undefined {
    const candidate =
      (observer as any)?.class ??
      (observer as any)?.constructor ??
      (observer as any)?.model ??
      undefined;
    let name: string | undefined;
    if (typeof candidate === "function") {
      name = candidate.name;
    } else if (typeof candidate === "string") {
      name = candidate;
    } else {
      name = (observer as any)?.constructor?.name;
    }
    if (!name || name === "Object") return undefined;
    // Default webhook topic: all events for the repo's model table.
    return `${name}.*`;
  }

  /**
   * @description Builds the URL of a subscription endpoint
   * @summary Resolves `<eventsListenerPath>/<action>`, ignoring any query string
   * or fragment of the listener path.
   * @param {Adapter} adapter - The observed adapter
   * @param {"subscribe"|"unsubscribe"} action - The endpoint to resolve
   * @returns {string|undefined} The endpoint URL, or undefined without a listener path
   */
  private subscriptionEndpoint(
    adapter: Adapter<HttpConfig, any, any, any>,
    action: "subscribe" | "unsubscribe"
  ): string | undefined {
    const { protocol, host, eventsListenerPath } = adapter.config as HttpConfig;
    if (!eventsListenerPath) return undefined;
    const base = new URL(eventsListenerPath, `${protocol}://${host}`);
    base.search = "";
    base.hash = "";
    base.pathname = base.pathname.replace(/\/?$/, "/");
    return new URL(action, base).toString();
  }

  /**
   * @description Synchronizes the adapter's subscriptions with the SSE server
   * @summary Computes the current observer topics and POSTs them to the server's
   * `subscribe` (or `unsubscribe` when no topics remain) endpoint with the
   * correlation id header. Skips the call when the topic signature is unchanged
   * unless `force` is true.
   * @param {boolean} [force=false] - When true, bypasses the change check
   * @throws {InternalError} When the server returns a non-2xx response
   */
  private async syncSubscriptionsInternal(force = false): Promise<void> {
    const conf = this.adapter?.config as HttpConfig | undefined;
    if (!conf?.eventsSubscription || !this.adapter) return;
    // before the first forced sync, startListening() will do it
    if (!force && !this.initialized) return;

    const topics = this.currentSubscriptionTopics();
    const endpoint = this.subscriptionEndpoint(
      this.adapter,
      topics.length ? "subscribe" : "unsubscribe"
    );
    if (!endpoint) return;

    const correlationId = await this.ensureCorrelationId();
    const signature = JSON.stringify(topics);
    if (!force && signature === this.lastSubscriptionSignature) return;
    this.lastSubscriptionSignature = signature;

    const headers = Object.assign(
      { "Content-Type": "application/json" },
      await this.resolveEventHeaders(),
      { [DecafHeaders.CORRELATION_ID]: correlationId }
    );
    const body = JSON.stringify(topics.length ? { topics } : {});
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
      credentials: "include",
    });
    if (!response.ok) {
      this.lastSubscriptionSignature = undefined;
      const text = await response.text().catch(() => "");
      throw new InternalError(
        `Failed to sync SSE subscriptions (${response.status} ${response.statusText}): ${text}`
      );
    }
  }

  /**
   * @description Removes a session's subscription registration on the SSE server
   * @summary POSTs to the server's `unsubscribe` endpoint with the session's
   * correlation id header, best-effort (errors are swallowed) since close must
   * always succeed.
   * @param {Adapter} adapter - The adapter the session belonged to
   * @param {string} correlationId - The session's correlation id
   */
  private async clearSubscriptionRegistration(
    adapter: Adapter<HttpConfig, any, any, any> | undefined,
    correlationId: string | undefined
  ): Promise<void> {
    const conf = adapter?.config as HttpConfig | undefined;
    if (!conf?.eventsSubscription || !adapter || !correlationId) return;

    const endpoint = this.subscriptionEndpoint(adapter, "unsubscribe");
    if (!endpoint) return;

    const headers = Object.assign(
      { "Content-Type": "application/json" },
      await this.resolveEventHeaders(adapter),
      { [DecafHeaders.CORRELATION_ID]: correlationId }
    );
    await fetch(endpoint, {
      method: "POST",
      headers,
      body: "{}",
      credentials: "include",
    }).catch(() => undefined);
  }

  /**
   * @description Resolves the adapter's custom event headers
   * @summary Invokes the adapter's `getEventHeaders()` hook, returning an empty
   * object when the adapter is missing or the hook throws.
   * @returns {Promise<Record<string, string>>} The resolved event headers
   */
  private async resolveEventHeaders(
    adapter = this.adapter
  ): Promise<Record<string, string>> {
    if (!adapter) return {};
    try {
      return (
        (await (adapter as unknown as HttpAdapter<any, any, any>)[
          "getEventHeaders"
        ]()) || {}
      );
    } catch {
      return {};
    }
  }

  /**
   * @description Closes the dispatcher, its SSE connection and its subscription
   * @summary Detaches the connector listener, closes the {@link ServerEventConnector}
   * (cancelling any pending reconnection) and marks the dispatcher as no longer
   * listening — synchronously, so an immediately following session is unaffected.
   * Then waits for a session start or subscription sync still in flight to settle
   * (an abandoned start never connects and withdraws its subscription) and
   * best-effort unsubscribes the closed session, so nothing outlives the call.
   * @param {...ContextualArgs} args - Contextual close arguments
   * @returns {Promise<void>} Resolves once the dispatcher is fully closed
   */
  override async close(
    ...args: ContextualArgs<Context<HttpFlags>>
  ): Promise<void> {
    // Supersedes this session synchronously (a session still starting must not
    // connect afterwards) and waits, below, for that start to settle.
    const closing = super.close(...args);
    // Detach this session synchronously too: the adapter may be observed again
    // (and a new session started) before the calls below return.
    const adapter = this.adapter;
    const correlationId = this.correlationId;
    const removeListener = this.removeConnectorListener;
    const connector = this.connector;
    const syncing = this.subscriptionSync;
    this.removeConnectorListener = undefined;
    this.connector = undefined;
    this.correlationId = undefined;
    this.lastSubscriptionSignature = undefined;
    this.listening = false;
    this.initialized = false;

    // closes the stream and cancels any pending reconnection (which also
    // releases a start waiting for the stream)
    removeListener?.();
    connector?.close();

    // let a start or subscription sync in flight settle: an abandoned start
    // withdraws its own late subscription, so nothing outlives close()
    await Promise.allSettled([closing, syncing]);

    try {
      await this.clearSubscriptionRegistration(adapter, correlationId);
    } catch {
      // closing should continue even if unsubscribe fails
    }
  }
}
