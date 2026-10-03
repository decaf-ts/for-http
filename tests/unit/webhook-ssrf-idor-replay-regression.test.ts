import { WebhookDeliveryService } from "../../src/server/hooks/DeliveryService";
import { WebhookPublisherService } from "../../src/server/hooks/PublisherService";
import { WebhookDelivery } from "../../src/server/hooks/models/WebhookDelivery";
import { WebhookEventRecord } from "../../src/server/hooks/models/WebhookEventRecord";
import { WebhookSubscription } from "../../src/server/hooks/models/WebhookSubscription";
import {
  signWebhookPayload,
  verifyWebhookSignature,
  isDisallowedWebhookTarget,
} from "../../src/server/hooks/utils";
import { WebhookSignatureMiddleware } from "../../src/server/hooks/middleware";
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
import { DeliveryServiceConfig } from "../../src/server/hooks";

RamAdapter.decoration();
Model.setBuilder(Model.fromModel);

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
 * G3-C4 SSRF / IDOR / replay regression suite (webhook path).
 *
 * This suite encodes the SECURITY CONTRACT that the G3 webhook/SSE remediation
 * is meant to deliver. It is an adversarial "exploit-proof" suite per the V2
 * §7.6 follow-up: each case asserts the desired security property against the
 * delivered code.
 *
 * IMPORTANT - how to read the results:
 *  - GREEN  = the protection is present and holds (regression-guarded).
 *  - RED    = the protection is MISSING, i.e. the exploit class is still LIVE.
 *            A red case here is a FINDING, not a test bug: it proves the stated
 *            security property is not enforced by the current implementation.
 *
 * Runs against the in-memory RAM adapter so the cases are self-contained.
 */
describe("Webhook C4 SSRF/IDOR/replay regression (security contract)", () => {
  let deliveryService: WebhookDeliveryService<AxiosHttpAdapter>;
  let publishService: WebhookPublisherService;
  let ramAdapter: RamAdapter;
  let deliveryRepo: Repo<WebhookDelivery>;
  let eventRepo: Repo<WebhookEventRecord>;
  let subRepo: Repo<WebhookSubscription>;

  beforeAll(async () => {
    ramAdapter = new RamAdapter({ UUID: "web-hooks-c4" });
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
      claimLeaseMs: 5000,
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
      // autoStart=false - nothing to stop
    }
  });

  const makeEventFixture = async (
    topic = "product.created",
    payloadObj: unknown = { hello: "world" }
  ): Promise<WebhookEventRecord> => {
    const id = `evt-${randomSuffix()}`;
    const event = await eventRepo.create(
      new WebhookEventRecord({
        id,
        topic,
        model: "Product",
        action: "created",
        entityId: `entity-${randomSuffix()}`,
        // Mirror the real publish() envelope: the payload embeds the event id so
        // a consumer can correlate the posted body back to its claimed event.
        payload: JSON.stringify({
          id,
          topic,
          ...(payloadObj as Record<string, unknown>),
        }),
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

  const makeSubscriptionFixture = async (
    overrides: Partial<WebhookSubscription> = {}
  ): Promise<WebhookSubscription> => {
    const subscription = await subRepo.create(
      new WebhookSubscription({
        topic: overrides.topic || "product.created",
        url: overrides.url || "http://localhost:9999/webhook",
        secret: overrides.secret || "subscription-secret",
        active: overrides.active ?? true,
      })
    );
    expect(subscription.hasErrors()).toBeUndefined();
    return subscription;
  };

  describe("1. SSRF — subscription target URL must be validated", () => {
    it("must not deliver a webhook to a link-local cloud-metadata address", async () => {
      const metadataUrl = "http://169.254.169.254/latest/meta-data/";
      const subscription = await makeSubscriptionFixture({ url: metadataUrl });

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
      expect(target.targetUrl).toBe(metadataUrl);

      const postSpy = jest
        .spyOn((deliveryService as any).http, "post")
        .mockResolvedValue({ code: 200, data: { ok: true } } as any);

      await (deliveryService as any).processOne(
        target.id,
        Context.factory({})
      );

      // CONTRACT: the engine must NOT issue an outbound request to a
      // link-local/private host (SSRF pivot). The SSRF guard
      // (isDisallowedWebhookTarget) rejects the target and fails the delivery
      // without calling post, so postSpy sees no outbound request.
      expect(postSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("169.254.169.254"),
        expect.anything(),
        expect.anything()
      );
    }, 15000);

    it("must not deliver a webhook to a loopback address", async () => {
      const loopbackUrl = "http://127.0.0.1:8080/internal/admin";
      const subscription = await makeSubscriptionFixture({ url: loopbackUrl });

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

      const postSpy = jest
        .spyOn((deliveryService as any).http, "post")
        .mockResolvedValue({ code: 200, data: { ok: true } } as any);

      await (deliveryService as any).processOne(
        target.id,
        Context.factory({})
      );

      // CONTRACT: loopback targets are refused. The SSRF guard
      // (isDisallowedWebhookTarget) rejects the target and fails the delivery
      // without posting, so postSpy sees no outbound request.
      expect(postSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("127.0.0.1"),
        expect.anything(),
        expect.anything()
      );
    }, 15000);

    it("must not follow a public-to-internal redirect (redirect-following disabled)", async () => {
      const publicUrl = "http://public.example.com/hook";
      const subscription = await makeSubscriptionFixture({ url: publicUrl });

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

      const postSpy = jest
        .spyOn((deliveryService as any).http, "post")
        .mockResolvedValue({ code: 200, data: { ok: true } } as any);

      await (deliveryService as any).processOne(
        target.id,
        Context.factory({})
      );

      expect(postSpy).toHaveBeenCalledTimes(1);
      const [, , options] = postSpy.mock.calls[0];

      // CONTRACT: the outbound delivery request must have redirect-following
      // disabled (or the engine must validate the redirect target) so a 302
      // from a public host cannot pivot the request into a private/internal
      // address. `processOne` sets `maxRedirects: 0`, so the transport does not
      // follow redirects on delivery.
      expect(options.maxRedirects).toBe(0);
    }, 15000);
  });

  describe("1b. SSRF guard — literal IPv6 and IPv4-mapped targets (F1)", () => {
    it("disallows a literal loopback IPv6 host http://[::1]", () => {
      expect(isDisallowedWebhookTarget("http://[::1]/path")).toBe(true);
      expect(isDisallowedWebhookTarget("http://[::1]:8080/hook")).toBe(true);
    });

    it("disallows the expanded loopback form http://[0:0:0:0:0:0:0:1]", () => {
      expect(isDisallowedWebhookTarget("http://[0:0:0:0:0:0:0:1]/")).toBe(
        true
      );
      // WHATWG normalizes the expanded form to [::1]; either text must be refused.
      expect(isDisallowedWebhookTarget("http://[0:0:0:0:0:0:0:1]:8080/hook")).toBe(
        true
      );
    });

    it("disallows a hex-form IPv4-mapped loopback http://[::ffff:7f00:1]", () => {
      // ::ffff:7f00:1 decodes to 127.0.0.1 (loopback) - must be refused even
      // though it matches neither ::1/:: nor the decimal ^::ffff:x.y.z.w regex.
      expect(isDisallowedWebhookTarget("http://[::ffff:7f00:1]/")).toBe(true);
      expect(isDisallowedWebhookTarget("http://[::ffff:7f00:1]:8080/hook")).toBe(
        true
      );
    });

    it("disallows a decimal-form IPv4-mapped loopback http://[::ffff:127.0.0.1]", () => {
      expect(isDisallowedWebhookTarget("http://[::ffff:127.0.0.1]/")).toBe(
        true
      );
    });

    it("disallows an IPv4-mapped private target http://[::ffff:7f00:1] in the private ranges", () => {
      // 0:0:0:0:0:0:ffff:7f00:1 etc. are equivalent; the mapped private targets
      // must be refused (RFC 1918 / loopback / link-local family).
      expect(isDisallowedWebhookTarget("http://[::ffff:7f00:1]/")).toBe(true);
      expect(isDisallowedWebhookTarget("http://[::ffff:a00:1]/")).toBe(true);
      expect(isDisallowedWebhookTarget("http://[::ffff:169.254.169.254]/")).toBe(
        true
      );
    });

    it("allows a public IPv6 target (non-loopback, non-mapped)", () => {
      expect(
        isDisallowedWebhookTarget("http://[2001:db8::1]:8080/hook")
      ).toBe(false);
      expect(isDisallowedWebhookTarget("http://[2606:4700:4700::1111]/")).toBe(
        false
      );
    });

    it("still allows a public IPv4 host and disallows private IPv4 hosts (existing IPv4 behaviour)", () => {
      expect(isDisallowedWebhookTarget("http://public.example.com/hook")).toBe(
        false
      );
      expect(isDisallowedWebhookTarget("http://127.0.0.1/hook")).toBe(true);
      expect(isDisallowedWebhookTarget("http://10.0.0.1/hook")).toBe(true);
      expect(isDisallowedWebhookTarget("http://169.254.169.254/latest/")).toBe(
        true
      );
      expect(isDisallowedWebhookTarget("http://172.16.0.1/hook")).toBe(true);
      expect(isDisallowedWebhookTarget("http://192.168.1.1/hook")).toBe(true);
      expect(isDisallowedWebhookTarget("http://8.8.8.8/hook")).toBe(false);
    });
  });

  describe("2. Replay protection — the signature must be timestamp-bound", () => {
    it("signWebhookPayload must produce a timestamped envelope (t=...,v1=...) ", () => {
      const body = JSON.stringify({ id: "evt-1", data: { a: 1 } });
      const signature = signWebhookPayload("subscription-secret", body);

      // CONTRACT: Stripe/Svix-style `t=<unix-ts>,v1=<hmac(t.body)>` so a
      // captured signature cannot be replayed indefinitely. `signWebhookPayload`
      // emits exactly this timestamped `t=...,v1=...` envelope.
      expect(signature).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    });

    it("binds the outbound delivery signature to the event id and timestamp", async () => {
      const event = await makeEventFixture();
      const delivery = await makeDeliveryFixture({
        eventId: event.id,
        targetUrl: "http://localhost:9999/webhook",
        status: WebhookStatus.PENDING,
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt: new Date(Date.now() - 1000),
      });

      const postSpy = jest
        .spyOn((deliveryService as any).http, "post")
        .mockResolvedValue({ code: 200, data: { ok: true } } as any);

      await (deliveryService as any).processOne(
        delivery.id,
        Context.factory({})
      );

      expect(postSpy).toHaveBeenCalledTimes(1);
      const [, , options] = postSpy.mock.calls[0];
      // CONTRACT: the signature header is a timestamped envelope. The delivery
      // signs with the `t=<unix-ts>,v1=<hmac(t.body)>` envelope, so the
      // signature is bound to the body (and the event id it embeds) and a
      // captured value cannot be replayed indefinitely.
      expect(options.headers["x-webhook-signature"]).toMatch(
        /^t=\d+,v1=[a-f0-9]{64}$/
      );
    }, 15000);
  });

  describe("3. Wrong-payload fallback (V2 Defect 4)", () => {
    it("must NOT post a different event's payload for a delivery's own event", async () => {
      // Delivery is created for eventOne (payload marker "ONE").
      const eventOne = await makeEventFixture("product.created", {
        marker: "ONE",
      });
      const delivery = await makeDeliveryFixture({
        eventId: eventOne.id,
        targetUrl: "http://localhost:9999/webhook",
        status: WebhookStatus.PENDING,
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt: new Date(Date.now() - 1000),
      });

      // Simulate the original event being lost / unreachable, then a NEWER
      // event existing on the same topic (the corrupting fallback branch).
      await (eventRepo as any).delete(eventOne.id, Context.factory({}));
      const eventTwo = await makeEventFixture("product.created", {
        marker: "TWO",
      });
      expect(eventTwo.id).not.toBe(eventOne.id);

      const postSpy = jest
        .spyOn((deliveryService as any).http, "post")
        .mockResolvedValue({ code: 200, data: { ok: true } } as any);

      await (deliveryService as any).processOne(
        delivery.id,
        Context.factory({})
      );

      // CONTRACT: a delivery must never substitute a different event's payload.
      // `readEventForDelivery` used to fall back to the LATEST same-topic event
      // when the own event could not be read, POSTing eventTwo's payload
      // (marker "TWO") while the delivery row / x-webhook-id still pointed at
      // eventOne - silent cross-event data corruption (V2 Defect 4). The fix
      // FAILS the delivery (no POST) when its own event is unreadable.
      expect(postSpy).not.toHaveBeenCalled();
      const failedDelivery = await deliveryRepo.read(delivery.id);
      expect(failedDelivery.status).toBe(WebhookStatus.FAILED);
      expect(String(failedDelivery.errorMessage || "").toLowerCase()).toContain(
        "unreadable"
      );
    }, 15000);
  });

  describe("4. Receiver-side replay — signature middleware", () => {
    it("rejects a replayed/expired signature (timestamp window enforced)", async () => {
      const body = JSON.stringify({ id: "evt-1", data: { a: 1 } });
      const secret = "subscription-secret";
      const middleware = new WebhookSignatureMiddleware();
      expect(middleware).toBeDefined();

      // CONTRACT: a captured signature is timestamp-bound. The verifier must
      // reject a signature whose timestamp is outside the acceptance window, so
      // a captured (body, signature) pair cannot be replayed indefinitely.
      // A freshly signed envelope is accepted...
      const signature = signWebhookPayload(secret, body);
      expect(signature).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
      expect(verifyWebhookSignature(secret, body, signature)).toBe(true);

      // ...while an expired/replayed (stale-timestamp) signature is rejected
      // even though its HMAC is internally consistent.
      const staleTimestamp = Math.floor(Date.now() / 1000) - 3600;
      const stale = signWebhookPayload(secret, body, staleTimestamp);
      expect(stale).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
      expect(verifyWebhookSignature(secret, body, stale)).toBe(false);
    }, 15000);
  });
});
