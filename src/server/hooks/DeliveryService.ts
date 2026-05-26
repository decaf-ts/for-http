import {
  Adapter,
  AllOperationKeys,
  ClientBasedService,
  ConfigOf,
  Context,
  ContextualArgs,
  EventIds,
  type MaybeContextualArg,
  ObserverFilter,
  OrderDirection,
  PersistenceKeys,
  type Repo,
  repository,
  service,
  UnsupportedError,
} from "@decaf-ts/core";
import { HookKey, WebhookDeliveryMode, WebhookStatus } from "./constants";
import { type Constructor, Metadata, uses } from "@decaf-ts/decoration";
import { Model } from "@decaf-ts/decorator-validation";
import { InternalError, OperationKeys } from "@decaf-ts/db-decorators";
import { WebhookDelivery } from "./models/WebhookDelivery";
import { WebhookEventRecord } from "./models/WebhookEventRecord";
import { computeNextAttempt, signWebhookPayload } from "./utils";
import { Lock } from "@decaf-ts/transactional-decorators";
import { getWebhookFilter, WebhookObserver } from "./observers";
import { DeliveryServiceConfig } from "./types";
import { WebhookPublisherService } from "./PublisherService";
import { HttpAdapter } from "../../adapter";
import { WebhookSubscription } from "./models/index";
import { HttpFlags } from "../../types";

@service()
export class WebhookDeliveryService<
  A extends HttpAdapter<any, any, any, any, any>,
> extends ClientBasedService<A, DeliveryServiceConfig<A>, Context<HttpFlags>> {
  @repository(WebhookDelivery)
  deliveries!: Repo<WebhookDelivery>;

  @repository(WebhookEventRecord)
  events!: Repo<WebhookEventRecord>;

  @service()
  publications!: WebhookPublisherService;

  protected adapters?: Adapter<any, any, any, any>[];

  private polling = false;
  private syncing = false;
  private running = false;

  protected lock = new Lock();

  protected controller?: AbortController;

  private _observer?: WebhookObserver;
  private _http?: HttpAdapter<any, any, any, any>;

  protected get observer() {
    if (!this._observer)
      this._observer = new this.config.observer!(this.config);
    return this._observer;
  }

  protected get http(): HttpAdapter<any, any, any, any> {
    if (!this._http) {
      if (!this.config.httpAdapter)
        throw new InternalError("HttpAdapter is required");
      if (this.config.httpAdapter instanceof HttpAdapter) {
        this._http = this.config.httpAdapter;
      } else {
        this._http = new this.config.httpAdapter(this.config.httpConfig || {});
      }
    }
    return this._http;
  }

  private _filter?: ObserverFilter;

  protected get filter() {
    if (!this._filter) this._filter = getWebhookFilter(this.config);
    return this._filter;
  }

  constructor() {
    super();
  }

  protected async isPolling() {
    await this.lock.acquire();
    try {
      return this.polling;
    } finally {
      this.lock.release();
    }
  }

  protected async isSyncing() {
    await this.lock.acquire();
    try {
      return this.syncing;
    } finally {
      this.lock.release();
    }
  }

  protected async isRunning() {
    await this.lock.acquire();
    try {
      return this.running;
    } finally {
      this.lock.release();
    }
  }

  protected async isActive() {
    await this.lock.acquire();
    try {
      return this.running || this.polling || this.syncing;
    } finally {
      this.lock.release();
    }
  }

  async stop(...args: MaybeContextualArg<any>) {
    if (!(await this.isActive())) return;
    const { log, ctx } = (await this.logCtx(args, "hooks-stop", true)).for(
      this.stop
    );
    this.polling = false;
    if (this.controller) {
      this.controller.abort();
    }
    this.syncing = false;
    await this.stopObserving(ctx);

    while (await this.isRunning()) {
      log.verbose(`Waiting for current deliveries to finish`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    log.info(`stopped`);
  }

  async start(...args: MaybeContextualArg<any>) {
    const { log, ctxArgs } = (
      await this.logCtx(args, "hooks-process", true)
    ).for(this.start);

    switch (this.config.mode) {
      case WebhookDeliveryMode.POLLING:
        await this.startPoll(...ctxArgs);
        break;
      case WebhookDeliveryMode.SYNCHRONOUS:
        await this.startSynchronous(...ctxArgs);
        break;
      default:
        throw new UnsupportedError(
          `Unsupported delivery mode ${this.config.mode}`
        );
    }
    log.info(`Webhook delivery engine running`);
  }

  protected async startSynchronous(...args: ContextualArgs<any>) {
    if (await this.isSyncing()) return;
    if (await this.isActive()) {
      throw new InternalError(
        `Trying to start sync model while still in polling mode`
      );
    }

    const { ctxArgs } = this.logCtx(args, this.startSynchronous);
    await this.startObserving(...ctxArgs);
    this.publications.observe(this);
  }

  protected async startPoll(...args: ContextualArgs<any>) {
    if (await this.isPolling()) return;
    if (await this.isActive()) {
      throw new InternalError(
        `Trying to start polling model while still in sync mode`
      );
    }
    const { log, ctxArgs } = this.logCtx(args, this.startPoll);
    this.controller = this.controller || new AbortController();
    this.polling = true;
    await this.startObserving(...ctxArgs);
    this.pollLoop(...ctxArgs).catch((e) => {
      log.error(`Polling loop failed`, e);
    });
  }

  protected async pollLoop(...args: ContextualArgs<any>) {
    const { log, ctx } = this.logCtx(args, this.pollLoop);
    const pollInterval = this.config.pollIntervalMs || 5000;
    log.debug(`hook polling loop started`);
    while (this.polling && !this.controller!.signal.aborted) {
      try {
        await this.tick(ctx);
      } catch (e: any) {
        log.error(`Polling iteration failed: ${e.message}`);
      }

      if (!this.polling || this.controller?.signal.aborted) break;

      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, pollInterval);
        this.controller!.signal.addEventListener(
          "abort",
          () => clearTimeout(timeout),
          { once: true }
        );
      });
    }
  }

  protected async tick(...args: ContextualArgs<any>): Promise<void> {
    if ((await this.isRunning()) || !(await this.isPolling())) return;
    const { log, ctx } = this.logCtx(args, this.tick);
    this.running = true;
    try {
      const processed = await this.processBatch(this.config.batchSize, ctx);
      if (processed > 0) {
        log.info(`Processed ${processed} webhook deliveries`);
      }
    } finally {
      this.running = false;
    }
  }

  async processBatch(
    batchSize = 50,
    ...args: MaybeContextualArg<any>
  ): Promise<number> {
    const { ctx, ctxArgs } = (
      await this.logCtx(args, "hooks-process", true)
    ).for(this.processBatch);
    const due = await this.claimDueDeliveries(batchSize, ctx);
    if (due.length === 0) return 0;

    return this.processMany(due, ...ctxArgs);
  }

  protected async processMany(
    due: WebhookDelivery[],
    ...args: ContextualArgs<any>
  ) {
    const { log, ctx } = this.logCtx(args, this.processMany);
    let processed: number = 0;
    let unprocessed = due.length;

    const isRunning = await this.isRunning();
    for (const delivery of due) {
      if (isRunning && this.controller!.signal.aborted) {
        log.verbose(`batch aborted after ${processed}/${due.length}`);
        break;
      }
      await this.processOne(delivery.id, ctx);
      processed++;
      unprocessed--;
    }

    log.info(
      `processed ${processed}/${due.length} hooks successfully.${unprocessed ? ` ${unprocessed}/${due.length} leftover from batch` : ""}`
    );
    return processed;
  }

  private async claimDueDeliveries(
    batchSize: number,
    ...args: ContextualArgs<any>
  ): Promise<WebhookDelivery[]> {
    const { ctx } = this.logCtx(args, this.claimDueDeliveries);

    let rows = await this.deliveries
      .select()
      .where(
        this.deliveries
          .attr("status")
          .in([WebhookStatus.PENDING, WebhookStatus.FAILED])
          .and(this.deliveries.attr("nextAttemptAt").lte(new Date()))
      )
      .orderBy("nextAttemptAt", OrderDirection.ASC)
      // .thenBy("createdAt", OrderDirection.ASC)
      .limit(batchSize)
      .execute(ctx);

    if (rows.length === 0) return [];

    for (const row of rows) {
      row.status = WebhookStatus.PROCESSING;
    }

    rows = await this.deliveries.updateAll(rows, ctx);
    return rows;
  }

  protected async processOne(
    deliveryId: string,
    ...args: ContextualArgs<any>
  ): Promise<void> {
    const { log, ctx } = this.logCtx(args, this.processOne);
    const delivery = await this.deliveries.read(deliveryId, ctx);
    const event = await this.events.read(delivery.eventId, ctx);

    const rawBody = event.payload;
    const signature = signWebhookPayload(delivery.secret, rawBody);
    const now = new Date();

    try {
      const rawResponse = await this.http.post(delivery.targetUrl, rawBody, {
        timeout: 10_000,
        headers: {
          "content-type": "application/json",
          "x-webhook-id": event.id,
          "x-webhook-topic": event.topic,
          "x-webhook-signature": signature,
        },
        transformResponse: [(v: any) => v],
        validateStatus: () => true,
      });
      const response = this.http["parseResponse"](
        undefined,
        OperationKeys.CREATE,
        rawResponse
      );

      // log.debug("rawResponse", { rawResponse });
      delivery.attempts += 1;
      delivery.lastAttemptAt = now;
      delivery.responseStatus = rawResponse.code;
      delivery.responseBody =
        typeof response === "string"
          ? response.slice(0, 50_000)
          : JSON.stringify(response).slice(0, 50_000);
      delivery.errorMessage = undefined;

      if (rawResponse.code >= 200 && rawResponse.code < 300) {
        delivery.status = WebhookStatus.COMPLETED;
      } else {
        delivery.status =
          delivery.attempts >= delivery.maxAttempts
            ? WebhookStatus.FAILED
            : WebhookStatus.FAILED;
        delivery.errorMessage = `HTTP ${rawResponse.code}`;
        delivery.nextAttemptAt = computeNextAttempt(delivery.attempts);
      }

      await this.deliveries.update(delivery, ctx);
      await this.refreshEventStatus(event.id, ctx);
    } catch (error: any) {
      delivery.attempts += 1;
      delivery.lastAttemptAt = now;
      delivery.responseStatus = undefined;
      delivery.responseBody = undefined;
      delivery.errorMessage = String(error?.message ?? "Unknown error").slice(
        0,
        50_000
      );
      delivery.updatedAt = now;
      delivery.status = WebhookStatus.FAILED;
      delivery.nextAttemptAt = computeNextAttempt(delivery.attempts);

      await this.deliveries.update(delivery, ctx);
      await this.refreshEventStatus(event.id, ctx);

      log.warn(
        `Webhook delivery ${delivery.id} failed: ${delivery.errorMessage}`
      );
    }
  }

  protected async refreshEventStatus(
    eventId: string,
    ...args: ContextualArgs<any>
  ): Promise<void> {
    const { ctx } = this.logCtx(args, this.refreshEventStatus);
    const deliveries = await this.deliveries.findBy("eventId", eventId, ctx);

    const succeeded = deliveries.filter(
      (d) => d.status === WebhookStatus.COMPLETED
    ).length;
    const failedTerminal = deliveries.filter(
      (d) => d.status === WebhookStatus.FAILED && d.attempts >= d.maxAttempts
    ).length;
    const pendingOrRetrying = deliveries.filter(
      (d) =>
        d.status === WebhookStatus.PENDING ||
        d.status === WebhookStatus.PROCESSING ||
        (d.status === WebhookStatus.FAILED && d.attempts < d.maxAttempts)
    ).length;

    const event = await this.events.read(eventId, ctx);
    event.deliveriesSucceeded = succeeded;
    event.deliveriesFailed = failedTerminal;
    event.updatedAt = new Date();

    if (succeeded === deliveries.length) {
      event.status = WebhookStatus.COMPLETED;
    } else if (pendingOrRetrying > 0) {
      event.status = WebhookStatus.PENDING;
    } else {
      event.status = WebhookStatus.FAILED;
    }

    const nextRetry = deliveries
      .filter(
        (d) =>
          d.status !== WebhookStatus.COMPLETED && d.attempts < d.maxAttempts
      )
      .map((d) => d.nextAttemptAt?.getTime() ?? Number.MAX_SAFE_INTEGER)
      .sort((a, b) => a - b)[0];

    event.nextAttemptAt =
      nextRetry && Number.isFinite(nextRetry)
        ? new Date(nextRetry)
        : new Date();

    await this.events.update(event, ctx);
  }

  async replayEvent(
    eventId: string,
    ...args: ContextualArgs<any>
  ): Promise<void> {
    const { ctx } = this.logCtx(args, this.replayEvent);
    const event = await this.events.read(eventId, ctx);
    const deliveries = await this.deliveries.findBy("eventId", event.id, ctx);

    const now = new Date();

    for (const d of deliveries) {
      d.status = WebhookStatus.PENDING;
      d.attempts = 0;
      d.nextAttemptAt = now;
      d.lastAttemptAt = null as any;
      d.errorMessage = undefined;
      d.responseStatus = undefined;
      d.responseBody = undefined;
    }

    event.status = WebhookStatus.PENDING;
    event.deliveriesSucceeded = 0;
    event.deliveriesFailed = 0;
    event.nextAttemptAt = now;
    event.updatedAt = now;

    await this.deliveries.updateAll(deliveries, ctx);
    await this.events.update(event, ctx);
  }

  protected models<M extends Model>() {
    const meta: Record<string, Constructor<M>> = Metadata["innerGet"](HookKey);
    if (!meta) return [];
    return Object.values(meta.models);
  }

  async startObserving(...args: ContextualArgs<any>) {
    const { log } = this.logCtx(args, this.stopObserving);
    this.adapters =
      this.adapters ||
      (this.config.flavours.map((f) => Adapter.get(f)) as any[]);
    for (const adapter of this.adapters) {
      adapter.observe(this.observer, this.filter);
      log.debug(`observing ${adapter.toString()}`);
    }
    this.deliveries.observe(this);
    log.debug(`started observing webhook deliveries`);
    log.verbose(`Observer events feed started`);
  }

  async stopObserving(...args: ContextualArgs<any>) {
    const { log } = this.logCtx(args, this.stopObserving);
    this.adapters =
      this.adapters ||
      (this.config.flavours.map((f) => Adapter.get(f)) as any[]);
    for (const adapter of this.adapters) {
      if (adapter) adapter.unObserve(this.observer);
      log.debug(`Stopped observing ${adapter.toString()}`);
    }
    this._observer = undefined;
    this.deliveries.unObserve(this);
    log.debug(`stopped observing webhook deliveries`);
    log.verbose(`Observer events feed stopped`);
  }

  async initialize(
    ...args: MaybeContextualArg<any>
  ): Promise<{ config: DeliveryServiceConfig<A>; client: A }> {
    const context = args.pop();
    if (!(context instanceof Context)) {
      args.push(context);
    }
    const cfg: DeliveryServiceConfig<A> | undefined = args.shift();
    if (!cfg) throw new InternalError(`No config found`);
    const models = cfg.models && cfg.models.length ? cfg.models : this.models();
    const flavours =
      cfg.flavours && cfg.flavours.length > 0
        ? cfg.flavours
        : [...new Set(models.map((m) => Metadata.flavourOf(m)))];
    const topics =
      cfg.topics && cfg.topics.length
        ? cfg.topics
        : models.map((m) => Model.hooks(m, !!cfg.allowWildcard)).flat();
    let client: A, clientConf: ConfigOf<A>;
    if (typeof cfg.adapter === "function") {
      client = new cfg.adapter(cfg.config, HookKey);
      uses(HookKey)(WebhookDelivery);
      uses(HookKey)(WebhookEventRecord);
      uses(HookKey)(WebhookSubscription);
      clientConf = cfg.config as ConfigOf<A>;
    } else {
      client = cfg.adapter as A;
      uses(client.alias)(WebhookDelivery);
      uses(client.alias)(WebhookEventRecord);
      uses(client.alias)(WebhookSubscription);
      clientConf = cfg.config || client.config;
    }

    this._client = client;
    this._config = {
      adapter: client.constructor as Constructor<A>,
      config: clientConf,
      mode: cfg.mode || WebhookDeliveryMode.POLLING,
      batchSize: cfg.batchSize || 50,
      pollIntervalMs: cfg.pollIntervalMs || 5000,
      autoStart: cfg.autoStart,
      topics: topics,
      models: models,
      flavours: flavours,
      observer: cfg.observer || WebhookObserver,
    };
    const { log, ctx } = (
      await this.logCtx(args, PersistenceKeys.INITIALIZATION, true)
    ).for(this.initialize);

    await client.initialize(ctx);

    if (cfg.callback) {
      log.info(`Calling configured callback`);
      try {
        cfg.callback(this.client, ctx);
      } catch (e: unknown) {
        throw new InternalError(
          `Failed to run configured callback before starting: ${e}`
        );
      }
    }

    if (this._config.autoStart)
      try {
        log.info(`Auto-starting Webhook delivery service`);
        await this.start(ctx);
      } catch (e: unknown) {
        throw new InternalError(
          `Failed to start Webhook delivery service: ${e}`
        );
      }
    return {
      client: client,
      config: this._config,
    };
  }

  override async shutdown(
    ...args: MaybeContextualArg<Context<HttpFlags>>
  ): Promise<void> {
    const { ctxArgs } = (
      await this.logCtx(args, PersistenceKeys.SHUTDOWN, true)
    ).for(this.shutdown);
    await this.stopObserving(...ctxArgs);
    await this.client.shutdown(...ctxArgs);
    return super.shutdown(...ctxArgs);
  }

  override async refresh(
    table: Constructor<any> | string,
    event: AllOperationKeys,
    ids: EventIds,
    ...args: ContextualArgs<Context<HttpFlags>>
  ): Promise<void> {
    const { log, ctx, ctxArgs } = this.logCtx(args, this.refresh, false);
    await super.refresh(table, event, ids, ...ctxArgs); // still triggers for normal observers

    if (!ctx.getOrUndefined("observeFullResult"))
      throw new InternalError(
        `"observeFullResult" config is necessary to enable webhooks`
      );
    if (!this.syncing) {
      log.warn(`events received when not in sync mode. discarding`);
      return;
    }

    let payload: WebhookDelivery | WebhookDelivery[] = args.shift();

    if (!payload)
      throw new InternalError(`no payload received in observable event`);

    ids = (Array.isArray(ids) ? ids : [ids]).map((n) => n.toString());
    payload = Array.isArray(payload) ? payload : [payload];
    if (ids.length !== payload.length)
      throw new InternalError(
        `id count doesn't match payload count. failed to update webhooks`
      );

    log.verbose(`Sync calling ${ids.length} webhook deliveries`);

    await this.processMany(payload, ctx);
  }
}
