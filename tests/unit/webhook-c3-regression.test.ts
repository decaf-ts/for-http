import { WebhookDeliveryService } from "../../src/server/hooks/DeliveryService";
import { WebhookPublisherService } from "../../src/server/hooks/PublisherService";
import { WebhookDelivery } from "../../src/server/hooks/models/WebhookDelivery";
import { WebhookEventRecord } from "../../src/server/hooks/models/WebhookEventRecord";
import { WebhookSubscription } from "../../src/server/hooks/models/WebhookSubscription";
import "../../src/server/hooks/overrides";
import {
  WebhookDeliveryMode,
  WebhookStatus,
} from "../../src/server/hooks/constants";
import { RamFlavour, RamAdapter } from "@decaf-ts/core/ram";
import {
  pk,
  Repo,
  createdAt,
  updatedAt,
  createdBy,
  updatedBy,
  Repository,
  uuid,
  column,
  Context,
} from "@decaf-ts/core";
import {
  model,
  Model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { AxiosHttpAdapter } from "../../src/axios/axios";
import { DeliveryServiceConfig, hook } from "../../src/server/hooks";
import { uses } from "@decaf-ts/decoration";
import { verifyWebhookSignature } from "../../src/server/hooks/utils";

RamAdapter.decoration();
Model.setBuilder(Model.fromModel);

@hook()
@uses(RamFlavour)
@model()
class Product extends Model<boolean> {
  @pk()
  @uuid()
  id!: string;

  @column()
  @required()
  classification!: string;

  @column()
  @createdAt()
  createdAt!: Date;

  @column()
  @updatedAt()
  updatedAt!: Date;

  @column()
  @createdBy()
  createdBy!: string;

  @column()
  @updatedBy()
  updatedBy!: string;

  constructor(arg?: ModelArg<Product>) {
    super(arg);
  }
}

function randomSuffix() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

jest.setTimeout(30000);

/**
 * C3 hardening regression suite for the webhook claim-loop / DLQ / atomicity /
 * secret-strip behaviour. Runs against the in-memory RAM adapter so the
 * regression cases are self-contained (no Nano/CouchDB stack required).
 *
 * Note on the RAM adapter: a property set to `undefined` is dropped on
 * serialization, so the in-memory adapter cannot represent "field removed".
 * Where a scenario asserts that a field is cleared (e.g. replay lease fields),
 * the regression proves the *behavioural* outcome (the delivery is reset and
 * immediately re-claimable with a fresh claim) rather than inspecting the
 * stored property membership.
 */
describe("Webhook C3 hardening regression", () => {
  let deliveryService: WebhookDeliveryService<AxiosHttpAdapter>;
  let publishService: WebhookPublisherService;
  let ramAdapter: RamAdapter;
  let deliveryRepo: Repo<WebhookDelivery>;
  let eventRepo: Repo<WebhookEventRecord>;
  let subRepo: Repo<WebhookSubscription>;
  const claimLeaseMs = 5000;

  beforeAll(async () => {
    ramAdapter = new RamAdapter({ UUID: "web-hooks" });
    const httpAdapter = new AxiosHttpAdapter({
      protocol: "http",
      host: "localhost",
    });

    publishService = new WebhookPublisherService();
    deliveryService = new WebhookDeliveryService();

    const hookCfg: DeliveryServiceConfig<RamAdapter> = {
      adapter: ramAdapter,
      httpAdapter: httpAdapter,
      mode: WebhookDeliveryMode.POLLING,
      autoStart: false,
      models: [Product],
      batchSize: 10,
      pollIntervalMs: 500,
      flavours: [RamFlavour],
      allowWildcard: true,
      claimLeaseMs,
    };

    await deliveryService.boot(hookCfg);

    deliveryRepo = Repository.forModel(WebhookDelivery);
    eventRepo = Repository.forModel(WebhookEventRecord);
    subRepo = Repository.forModel(WebhookSubscription);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    try {
      await deliveryService.stop();
    } catch {
      // never observed (autoStart=false) - nothing to stop
    }
  });

  const makeEventFixture = async (
    topic = "product.created"
  ): Promise<WebhookEventRecord> => {
    const event = await eventRepo.create(
      new WebhookEventRecord({
        topic,
        model: "Product",
        action: "created",
        entityId: `entity-${randomSuffix()}`,
        payload: JSON.stringify({ topic, hello: "world" }),
        status: WebhookStatus.PENDING,
        deliveriesTotal: 1,
        deliveriesSucceeded: 0,
        deliveriesFailed: 0,
        nextAttemptAt: new Date(),
      })
    );
    expect(event.hasErrors()).toBeUndefined();
    return event;
  };

  const makeDeliveryFixture = async (
    overrides: Partial<WebhookDelivery> = {}
  ): Promise<WebhookDelivery> => {
    const eventId = overrides.eventId || (await makeEventFixture()).id;
    const delivery = await deliveryRepo.create(
      new WebhookDelivery({
        eventId,
        subscriptionId: overrides.subscriptionId || `sub-${randomSuffix()}`,
        topic: overrides.topic || "product.created",
        targetUrl: overrides.targetUrl || "http://localhost:9999/webhook",
        attempts: overrides.attempts ?? 0,
        maxAttempts: overrides.maxAttempts ?? 12,
        nextAttemptAt:
          overrides.nextAttemptAt || new Date(Date.now() - 1000),
        status: overrides.status ?? WebhookStatus.PENDING,
        secret: overrides.secret,
        claimedBy: overrides.claimedBy,
        leaseUntil: overrides.leaseUntil,
        lastAttemptAt: null,
        responseStatus: null,
        responseBody: null,
        errorMessage: null,
      })
    );
    expect(delivery.hasErrors()).toBeUndefined();
    return delivery;
  };

  describe("1. Claim-loop / DLQ terminality", () => {
    it("parks a maxed-out delivery in DLQ, never re-claims it, and terminal-fails the event", async () => {
      const event = await makeEventFixture();
      const delivery = await makeDeliveryFixture({
        eventId: event.id,
        maxAttempts: 2,
        status: WebhookStatus.PENDING,
        attempts: 0,
        nextAttemptAt: new Date(Date.now() - 1000),
      });

      const postSpy = jest
        .spyOn((deliveryService as any).http, "post")
        .mockResolvedValue({ code: 500, data: { error: "boom" } } as any);

      // attempt 1 -> FAILED (retryable)
      await (deliveryService as any).processOne(
        delivery.id,
        Context.factory({})
      );
      const afterFirst = await deliveryRepo.read(delivery.id);
      expect(afterFirst.status).toBe(WebhookStatus.FAILED);
      expect(afterFirst.attempts).toBe(1);

      // attempt 2 -> exhausts maxAttempts, parks in DLQ
      await (deliveryService as any).processOne(
        delivery.id,
        Context.factory({})
      );
      const afterSecond = await deliveryRepo.read(delivery.id);
      expect(afterSecond.status).toBe(WebhookStatus.DLQ);
      expect(afterSecond.attempts).toBe(2);
      // exactly two POSTs happened, never a third
      expect(postSpy).toHaveBeenCalledTimes(2);

      // the owning event reflects a terminal failure
      const refreshedEvent = await eventRepo.read(event.id);
      expect(refreshedEvent.status).toBe(WebhookStatus.FAILED);
      expect(refreshedEvent.deliveriesFailed).toBe(1);
      expect(refreshedEvent.deliveriesSucceeded).toBe(0);

      // the exhausted row is never re-selected by the claim query
      const claims = await (deliveryService as any).claimDueDeliveries(
        100,
        Context.factory({})
      );
      const claimedIds = claims.map((c: WebhookDelivery) => c.id);
      expect(claimedIds).not.toContain(delivery.id);

      // and the row is left terminal (not flipped back to PROCESSING on a claim)
      const stillTerminal = await deliveryRepo.read(delivery.id);
      expect(stillTerminal.status).toBe(WebhookStatus.DLQ);
    }, 15000);
  });

  describe("2. Stale PROCESSING lease recovery", () => {
    it("reclaims an expired PROCESSING lease but not a fresh one", async () => {
      const staleEvent = await makeEventFixture();
      const stale = await makeDeliveryFixture({
        eventId: staleEvent.id,
        status: WebhookStatus.PROCESSING,
        attempts: 0,
        claimedBy: "old-writer",
        leaseUntil: new Date(Date.now() - 10_000),
        nextAttemptAt: new Date(Date.now() - 60_000),
      });

      const freshEvent = await makeEventFixture();
      const fresh = await makeDeliveryFixture({
        eventId: freshEvent.id,
        status: WebhookStatus.PROCESSING,
        attempts: 0,
        claimedBy: "old-writer",
        leaseUntil: new Date(Date.now() + 60_000),
        nextAttemptAt: new Date(Date.now() - 60_000),
      });

      const claims = await (deliveryService as any).claimDueDeliveries(
        100,
        Context.factory({})
      );
      const claimedIds = claims.map((c: WebhookDelivery) => c.id);

      // stale lease is reclaimed with a fresh claim
      expect(claimedIds).toContain(stale.id);
      const reclaimed = claims.find(
        (c: WebhookDelivery) => c.id === stale.id
      );
      expect(reclaimed.status).toBe(WebhookStatus.PROCESSING);
      expect(reclaimed.claimedBy).not.toBe("old-writer");
      expect(reclaimed.claimedBy).toBeTruthy();
      const expectedStaleLease = Date.now() + claimLeaseMs;
      expect(
        Math.abs(reclaimed.leaseUntil.getTime() - expectedStaleLease)
      ).toBeLessThan(3000);

      // fresh lease is NOT reclaimed and keeps its existing claim
      expect(claimedIds).not.toContain(fresh.id);
      const untouched = await deliveryRepo.read(fresh.id);
      expect(untouched.claimedBy).toBe("old-writer");
      expect(untouched.leaseUntil!.getTime()).toBeGreaterThan(Date.now());
    }, 15000);
  });

  describe("3. Atomic claim lease fields", () => {
    it("writes status=PROCESSING, claimedBy and leaseUntil at now+claimLeaseMs", async () => {
      const delivery = await makeDeliveryFixture({
        status: WebhookStatus.PENDING,
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt: new Date(Date.now() - 1000),
      });

      const claims = await (deliveryService as any).claimDueDeliveries(
        100,
        Context.factory({})
      );
      const claim = claims.find(
        (c: WebhookDelivery) => c.id === delivery.id
      );

      expect(claim).toBeDefined();
      expect(claim.status).toBe(WebhookStatus.PROCESSING);
      // writerId is `${process.pid}-${Date.now().toString(36)}`, so it carries a "-"
      expect(claim.claimedBy).toBeTruthy();
      expect(claim.claimedBy).toContain("-");
      expect(claim.leaseUntil).toBeInstanceOf(Date);
      const expected = Date.now() + claimLeaseMs;
      expect(Math.abs(claim.leaseUntil.getTime() - expected)).toBeLessThan(
        3000
      );
    }, 15000);
  });

  describe("4. Secret-strip", () => {
    it("publish strips the secret and signs from the subscription secret", async () => {
      const subscription = await subRepo.create(
        new WebhookSubscription({
          topic: "product.created",
          url: "http://localhost:9999/webhook",
          secret: "subscription-secret",
          active: true,
        })
      );
      expect(subscription.hasErrors()).toBeUndefined();

      await publishService.publish({
        entity: "Product",
        action: "created",
        entityId: `entity-${randomSuffix()}`,
        payload: { hello: "world" },
      });

      const deliveries = await deliveryRepo.select().limit(100).execute();
      const target = deliveries.find(
        (d) => d.subscriptionId === subscription.id
      );
      expect(target).toBeDefined();
      // new rows never carry the secret
      expect(target.secret).toBeUndefined();

      // signing is derived from the subscription secret, not the delivery row
      const postSpy = jest
        .spyOn((deliveryService as any).http, "post")
        .mockResolvedValue({ code: 200, data: { ok: true } } as any);

      await (deliveryService as any).processOne(
        target.id,
        Context.factory({})
      );

      expect(postSpy).toHaveBeenCalledTimes(1);
      const [, body, options] = postSpy.mock.calls[0];
      expect(typeof body).toBe("string");
      // Signature is a timestamped envelope bound to the subscription secret;
      // verify it (timestamp-tolerant) rather than byte-compare two envelopes
      // generated at different seconds.
      expect(options.headers["x-webhook-signature"]).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
      expect(
        verifyWebhookSignature(
          "subscription-secret",
          body as string,
          options.headers["x-webhook-signature"]
        )
      ).toBe(true);

      // loading the delivery by id does not expose the subscription secret
      const reloaded = await deliveryRepo.read(target.id);
      expect(reloaded.secret).toBeUndefined();
      // the subscription still holds the secret (not copied onto the row)
      const persistedSub = await subRepo.read(subscription.id);
      expect(persistedSub.secret).toBe("subscription-secret");
    }, 15000);

    it("falls back to the legacy delivery secret when no subscription matches", async () => {
      const event = await makeEventFixture();
      const legacy = await makeDeliveryFixture({
        eventId: event.id,
        subscriptionId: `ghost-${randomSuffix()}`,
        status: WebhookStatus.PENDING,
        attempts: 0,
        maxAttempts: 12,
        // legacy rows still carry a secret
        secret: "legacy-secret",
        nextAttemptAt: new Date(Date.now() - 1000),
      } as any);

      const postSpy = jest
        .spyOn((deliveryService as any).http, "post")
        .mockResolvedValue({ code: 200, data: { ok: true } } as any);

      await (deliveryService as any).processOne(
        legacy.id,
        Context.factory({})
      );
      expect(postSpy).toHaveBeenCalledTimes(1);
      const [, body, options] = postSpy.mock.calls[0];
      expect(options.headers["x-webhook-signature"]).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
      expect(
        verifyWebhookSignature(
          "legacy-secret",
          body as string,
          options.headers["x-webhook-signature"]
        )
      ).toBe(true);
    }, 15000);
  });

  describe("5. Replay-from-DLQ", () => {
    it("resets a DLQ delivery to PENDING with attempts=0 and leaves it immediately re-claimable", async () => {
      const event = await makeEventFixture();
      const paused = await makeDeliveryFixture({
        eventId: event.id,
        status: WebhookStatus.DLQ,
        attempts: 2,
        maxAttempts: 2,
        claimedBy: "writer-1",
        leaseUntil: new Date(Date.now() - 10_000),
        nextAttemptAt: new Date(Date.now() - 5_000),
        errorMessage: "HTTP 500",
        responseStatus: 500,
        responseBody: "boom",
      } as any);

      await (deliveryService as any).replayEvent(
        event.id,
        Context.factory({})
      );

      const replayed = await deliveryRepo.read(paused.id);
      expect(replayed.status).toBe(WebhookStatus.PENDING);
      expect(replayed.attempts).toBe(0);
      const now = Date.now();
      expect(replayed.nextAttemptAt.getTime()).toBeGreaterThan(now - 5000);
      expect(replayed.nextAttemptAt.getTime()).toBeLessThanOrEqual(now);

      const refreshedEvent = await eventRepo.read(event.id);
      expect(refreshedEvent.status).toBe(WebhookStatus.PENDING);
      expect(refreshedEvent.deliveriesFailed).toBe(0);
      expect(refreshedEvent.deliveriesSucceeded).toBe(0);

      // the replayed row is no longer terminal: it is immediately re-claimed
      // with a fresh lease (the RAM adapter drops undefined on serialization,
      // so the cleared lease fields are proven behaviorally via re-claim).
      const claims = await (deliveryService as any).claimDueDeliveries(
        100,
        Context.factory({})
      );
      const claim = claims.find((c: WebhookDelivery) => c.id === paused.id);
      expect(claim).toBeDefined();
      expect(claim.status).toBe(WebhookStatus.PROCESSING);
      expect(claim.claimedBy).not.toBe("writer-1");
      expect(claim.leaseUntil!.getTime()).toBeGreaterThan(Date.now());
    }, 15000);
  });
});
