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
import { HttpAdapter } from "./adapter";

export class HttpDispatcher extends Dispatch<
  Adapter<HttpConfig, any, PreparedStatement<any>, Context<HttpFlags>>
> {
  private connector?: ServerEventConnector;
  private removeConnectorListener?: () => void;
  private subscriptionId?: string;
  private subscriptionSync?: Promise<void>;
  private lastSubscriptionSignature?: string;

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
      throw new InternalError(
        "Cannot start listening before call initialize()"
      );
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
      throw new InternalError("No eventsListenerPath specified");
    }

    const listeningUrl = new URL(
      eventsListenerPath,
      `${protocol}://${host}`
    ).toString();
    const subscriptionMode = Boolean(conf.eventsSubscription);
    const subscriberId = await this.ensureSubscriptionId();
    const subscribedUrl = subscriptionMode
      ? this.appendQuery(listeningUrl, { subscriberId })
      : listeningUrl;

    if (subscriptionMode) {
      await this.syncSubscriptions(true);
    }

    log.info(`Opening ServerEventConnector for url: ${subscribedUrl}`);
    this.connector = ServerEventConnector.open(subscribedUrl, async () => {
      if (!this.adapter) throw new InternalError("Adapter not initialized");
      try {
        return (this.adapter as any).getEventHeaders();
      } catch (e: unknown) {
        throw new InternalError(`Failed to get event headers: ${e}`);
      }
    });

    log.debug(
      `ServerEventConnector opened successfully for url: ${subscribedUrl}`
    );
    this.removeConnectorListener?.();
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
    });

    // Avoid races where writes happen before the SSE stream finishes connecting.
    await this.connector.ensureListening();

    this.listening = true;
    log.info(`HttpDispatcher is now listening at ${subscribedUrl}.`);
  }

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

  private async ensureSubscriptionId(): Promise<string> {
    if (!this.subscriptionId) {
      this.subscriptionId = await Promise.resolve(UUID.instance.generate());
    }
    return this.subscriptionId;
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

  private topicForObserver(observer: Observer): string | undefined {
    const candidate =
      (observer as any)?.class ??
      (observer as any)?.constructor ??
      (observer as any)?.model ??
      undefined;
    if (typeof candidate === "function") {
      return candidate.name;
    }
    if (typeof candidate === "string") return candidate;
    const name = (observer as any)?.constructor?.name;
    return name && name !== "Object" ? name : undefined;
  }

  private buildEventBaseUrl(): URL | undefined {
    if (!this.adapter) return undefined;
    const { protocol, host, eventsListenerPath } = this.adapter
      .config as HttpConfig;
    if (!eventsListenerPath) return undefined;
    return new URL(eventsListenerPath, `${protocol}://${host}`);
  }

  private async syncSubscriptionsInternal(force = false): Promise<void> {
    const conf = this.adapter?.config as HttpConfig | undefined;
    if (!conf?.eventsSubscription || !this.adapter) return;

    const baseUrl = this.buildEventBaseUrl();
    if (!baseUrl) return;

    const subscriberId = await this.ensureSubscriptionId();
    const topics = this.currentSubscriptionTopics();
    const signature = JSON.stringify(topics);
    if (!force && signature === this.lastSubscriptionSignature) return;
    this.lastSubscriptionSignature = signature;

    const endpoint = new URL(
      topics.length ? "subscribe" : "unsubscribe",
      `${baseUrl.toString().replace(/\/?$/, "/")}`
    ).toString();
    const headers = Object.assign(
      { "Content-Type": "application/json" },
      await this.resolveEventHeaders()
    );
    const body = JSON.stringify(
      topics.length ? { subscriberId, topics } : { subscriberId }
    );
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new InternalError(
        `Failed to sync SSE subscriptions (${response.status} ${response.statusText}): ${text}`
      );
    }
  }

  private async clearSubscriptionRegistration(): Promise<void> {
    const conf = this.adapter?.config as HttpConfig | undefined;
    if (!conf?.eventsSubscription || !this.adapter || !this.subscriptionId)
      return;

    const baseUrl = this.buildEventBaseUrl();
    if (!baseUrl) return;

    const endpoint = new URL(
      "unsubscribe",
      `${baseUrl.toString().replace(/\/?$/, "/")}`
    ).toString();
    const headers = Object.assign(
      { "Content-Type": "application/json" },
      await this.resolveEventHeaders()
    );
    await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ subscriberId: this.subscriptionId }),
    }).catch(() => undefined);
    this.lastSubscriptionSignature = undefined;
  }

  private async resolveEventHeaders(): Promise<Record<string, string>> {
    if (!this.adapter) return {};
    try {
      return (
        (await (this.adapter as HttpAdapter<any, any, any>)[
          "getEventHeaders"
        ]()) || {}
      );
    } catch {
      return {};
    }
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

    try {
      await this.clearSubscriptionRegistration();
    } catch {
      // closing should continue even if unsubscribe fails
    }

    this.removeConnectorListener?.();
    this.removeConnectorListener = undefined;
    this.connector?.close();
    this.listening = false;
  }
}
