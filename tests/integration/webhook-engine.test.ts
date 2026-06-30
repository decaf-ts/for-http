import { WebhookSubscription } from "../../src/server/hooks/models/WebhookSubscription";
import { WebhookEventRecord } from "../../src/server/hooks/models/WebhookEventRecord";
import { WebhookDelivery } from "../../src/server/hooks/models/WebhookDelivery";
import "../../src/server/hooks/overrides";
import {
  WebhookDeliveryMode,
  WebhookStatus,
} from "../../src/server/hooks/constants";
import { NanoAdapter, NanoRepository } from "@decaf-ts/for-nano";
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
  PersistenceObserver,
  EventIds,
  ContextualArgs,
  Context,
} from "@decaf-ts/core";
import { RamFlavour, RamAdapter } from "@decaf-ts/core/ram";
import {
  model,
  Model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { AxiosHttpAdapter } from "../../src/axios/axios";
import { WebhookDeliveryService } from "../../src/server/hooks/DeliveryService";
import * as http from "http";
import {
  DeliveryServiceConfig,
  hook,
  WebhookPublisherService,
  WebhookSubscriptionService,
} from "../../src/server/hooks";
import { signWebhookPayload } from "../../src/server/hooks/utils";
import { Constructor, uses } from "@decaf-ts/decoration";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { InternalError } from "@decaf-ts/db-decorators";

NanoAdapter.decoration();
Model.setBuilder(Model.fromModel);
jest.setTimeout(120000);

function randomSuffix() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function waitFor<T>(
  condition: () => Promise<T | false> | T | false,
  timeoutMs = 15000,
  intervalMs = 150
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await condition();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new InternalError(`Timed out after ${timeoutMs}ms waiting for condition`);
}

async function createNanoTestResources() {
  const adminUser = process.env.NANO_ADMIN_USER || "couchdb.admin";
  const adminPassword = process.env.NANO_ADMIN_PASSWORD || "couchdb.admin";
  const dbHost = process.env.NANO_HOST || "localhost:10010";
  const dbProtocol = (process.env.NANO_PROTOCOL as "http" | "https") || "http";

  const suffix = randomSuffix();
  const dbName = `webhook_engine_${suffix}`;
  const user = `webhook_user_${suffix}`;
  const password = `${user}_pw`;
  const connection = NanoAdapter.connect(
    adminUser,
    adminPassword,
    dbHost,
    dbProtocol
  );

  await NanoAdapter.createDatabase(connection, dbName).catch((e: any) => {
    if (!(e instanceof Error) || (e as any).error !== "file_exists") {
      throw new InternalError(String(e));
    }
  });
  await NanoAdapter.createUser(connection, dbName, user, password).catch(
    (e: any) => {
      if (!(e instanceof Error) || (e as any).error !== "file_exists") {
        throw new InternalError(String(e));
      }
    }
  );

  return {
    connection,
    dbName,
    user,
    password,
    host: dbHost,
    protocol: dbProtocol,
  };
}

async function cleanupNanoTestResources(resources: any) {
  const { connection, dbName, user } = resources;
  try {
    await NanoAdapter.deleteDatabase(connection, dbName);
  } catch (e: any) {
    if (!(e instanceof Error)) throw new InternalError(String(e));
  }
  try {
    await NanoAdapter.deleteUser(connection, dbName, user);
  } catch (e: any) {
    if (!(e instanceof Error)) throw new InternalError(String(e));
  } finally {
    NanoAdapter.closeConnection(connection);
  }
}

let resources: Awaited<ReturnType<typeof createNanoTestResources>>;

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

describe("Webhook Engine Full Integration Test", () => {
  let nanoAdapter: NanoAdapter;
  let subRepo: Repo<WebhookSubscription>;
  let eventRepo: Repo<WebhookEventRecord>;
  let deliveryRepo: Repo<WebhookDelivery>;
  let productRepo: Repo<Product>;
  let createdProductId: string | undefined;
  let subService: WebhookSubscriptionService;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let publishService: WebhookPublisherService;
  let deliveryService: WebhookDeliveryService<AxiosHttpAdapter>;
  let ramAdapter: RamAdapter;

  let server: http.Server;
  let serverUrl: string;
  let receivedRequests: Array<{ url: string; body: any; headers: any }> = [];

  describe("basic observable pipeline", () => {
    beforeAll(async () => {
      const hasRamAdapter = !!RamAdapter;
      ramAdapter = ramAdapter || new RamAdapter({ UUID: "web-hooks" });
      if (!hasRamAdapter) await ramAdapter.initialize();

      productRepo = Repository.forModel(Product);
      expect(productRepo).toBeInstanceOf(Repository);
    });

    it("triggers the observable pipeline", async () => {
      const p = new Product({
        classification: "Product A",
      });

      const mock = jest.fn();

      const observer = new (class implements PersistenceObserver<any> {
        refresh(
          model: Constructor,
          event: string,
          ids: EventIds,
          payload: any,
          ...args: ContextualArgs<any>
        ): Promise<void> {
          return mock(model, event, ids, payload, ...args);
        }
      })();

      productRepo.observe(observer);

      const created = await productRepo.create(p);
      expect(created.hasErrors()).toBeUndefined();
      expect(created.id).toBeDefined();

      expect(mock).toHaveBeenCalled();
      expect(mock).toHaveBeenCalledWith(
        Product,
        OperationKeys.CREATE,
        created.id,
        created,
        expect.any(Context)
      );
    });
  });

  describe("Webhook engine", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    beforeAll(async () => {
      resources = await createNanoTestResources();

      server = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          receivedRequests.push({
            url: req.url || "/",
            body: JSON.parse(body),
            headers: req.headers,
          });

          if (req.url === "/webhook1") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ok", endpoint: "/webhook1" }));
          } else if (req.url === "/webhook2") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ok", endpoint: "/webhook2" }));
          } else if (req.url === "/webhook3") {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
          } else if (req.url === "/webhook4") {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Service Unavailable" }));
          } else {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Not Found" }));
          }
        });
      });

      server.listen(0);
      const address = server.address() as any;
      serverUrl = `http://localhost:${address.port}`;

      const hasRamAdapter = !!RamAdapter;
      ramAdapter = ramAdapter || new RamAdapter({ UUID: "web-hooks" });
      if (!hasRamAdapter) await ramAdapter.initialize();

      const httpAdapter = new AxiosHttpAdapter({
        protocol: "http",
        host: "localhost",
      });

      nanoAdapter = new NanoAdapter(
        {
          user: resources.user,
          password: resources.password,
          host: resources.host,
          dbName: resources.dbName,
          protocol: resources.protocol,
        },
        resources.dbName
      );

      publishService = new WebhookPublisherService();
      deliveryService = new WebhookDeliveryService();
      subService = new WebhookSubscriptionService();

      const hookCfg: DeliveryServiceConfig<NanoAdapter> = {
        adapter: nanoAdapter,
        httpAdapter: httpAdapter,
        mode: WebhookDeliveryMode.SYNCHRONOUS,
        autoStart: true,
        models: [Product],
        batchSize: 2,
        pollIntervalMs: 500,
        flavours: [RamFlavour],
        allowWildcard: true,
        callback: async (adapter) => {
          try {
            await adapter["index"](
              WebhookEventRecord,
              WebhookSubscription as any,
              WebhookDelivery as any
            );
            console.log("indexes created");
          } catch (e: unknown) {
            console.error("failed to index", e);
          }
        },
      };

      await deliveryService.boot(hookCfg);

      productRepo = productRepo || Repository.forModel(Product);
      subRepo = Repository.forModel(WebhookSubscription);
      eventRepo = Repository.forModel(WebhookEventRecord);
      deliveryRepo = Repository.forModel(WebhookDelivery);
      expect(productRepo).toBeInstanceOf(Repository);
      expect(subRepo).toBeInstanceOf(NanoRepository);
      expect(eventRepo).toBeInstanceOf(NanoRepository);
      expect(deliveryRepo).toBeInstanceOf(NanoRepository);
    });

    afterAll(async () => {
      await deliveryService.stop();
      server.close();
      await cleanupNanoTestResources(resources);
    });

    it("should create subscriptions", async () => {
      receivedRequests = [];
      const endpoints = new Array(5)
        .fill(0)
        .map((_, i) => `${serverUrl}/webhook${i + 1}`);
      const subs = endpoints.map(
        (e, i) =>
          new WebhookSubscription({
            topic: i === 0 ? "product.*" : "product.created",
            url: e,
            secret: "test-secret",
            active: true,
          })
      );

      const createdSubs = await subRepo.createAll(subs);
      expect(createdSubs.length).toBe(5);
      for (const createdSub of createdSubs)
        expect(createdSub.hasErrors()).toBeUndefined();
    }, 10000);

    const createWebhookFixture = async (targetUrl: string) => {
      const event = await eventRepo.create(
        new WebhookEventRecord({
          topic: "product.created",
          model: "Product",
          action: "created",
          entityId: `entity-${randomSuffix()}`,
          payload: JSON.stringify({
            topic: "product.created",
            targetUrl,
          }),
          status: WebhookStatus.PENDING,
          deliveriesTotal: 1,
          deliveriesSucceeded: 0,
          deliveriesFailed: 0,
          nextAttemptAt: new Date(),
        })
      );

      const delivery = await deliveryRepo.create(
        new WebhookDelivery({
          eventId: event.id,
          subscriptionId: `subscription-${randomSuffix()}`,
          topic: "product.created",
          targetUrl,
          secret: "test-secret",
          attempts: 0,
          maxAttempts: 12,
          nextAttemptAt: new Date(),
          lastAttemptAt: null,
          responseStatus: null,
          responseBody: null,
          errorMessage: null,
          status: WebhookStatus.PENDING,
        })
      );

      return { event, delivery };
    };

    it("should trigger subscriptions on product create", async () => {
      const p = new Product({
        classification: "Product A",
      });

      const created = await productRepo.create(p);
      expect(created.hasErrors()).toBeUndefined();
      expect(created.id).toBeDefined();
      createdProductId = created.id;

      const events = await waitFor(async () => {
        const rows = await eventRepo.select().limit(250).execute();
        const matches = rows.filter((row) => row.entityId === created.id);
        return matches.length > 0 ? matches : false;
      }, 30000);
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].topic).toBe("product.created");
    }, 45000);

    it("should create deliveries for matching subscriptions", async () => {
      expect(createdProductId).toBeDefined();
      const events = await waitFor(async () => {
        const rows = await eventRepo.select().limit(250).execute();
        const matches = rows.filter(
          (row) => row.entityId === (createdProductId as string)
        );
        return matches.length > 0 ? matches : false;
      }, 30000);
      expect(events.length).toBeGreaterThan(0);

      const deliveries = await waitFor(async () => {
        const rows = await deliveryRepo.findBy("eventId", events[0].id);
        return rows.length > 0 ? rows : false;
      }, 30000);
      expect(deliveries.length).toBeGreaterThan(0);
      for (const d of deliveries) {
        expect(d.eventId).toBeDefined();
        expect(d.subscriptionId).toBeDefined();
        expect(Object.values(WebhookStatus)).toContain(d.status);
        expect(d.attempts).toBeGreaterThanOrEqual(0);
        expect(d.maxAttempts).toBe(12);
      }
    }, 30000);

    it("should process deliveries successfully (200 OK)", async () => {
      const { delivery } = await createWebhookFixture(`${serverUrl}/webhook1`);
      const postSpy = jest
        .spyOn((deliveryService as any).http, "post")
        .mockResolvedValue({
          code: 200,
          data: { status: "ok", endpoint: "/webhook1" },
        } as any);

      await (deliveryService as any).processOne(
        delivery.id,
        Context.factory({})
      );

      expect(postSpy).toHaveBeenCalledTimes(1);

      const refreshed = await deliveryRepo.read(delivery.id);
      expect(refreshed.status).toBe(WebhookStatus.COMPLETED);
      expect(refreshed.attempts).toBeGreaterThan(0);
      expect(refreshed.responseStatus).toBe(200);
      expect(refreshed.responseBody).toBeDefined();
    }, 20000);

    it("should handle failed deliveries (500 error)", async () => {
      const { delivery } = await createWebhookFixture(`${serverUrl}/webhook3`);
      jest.spyOn((deliveryService as any).http, "post").mockResolvedValue({
        code: 500,
        data: { error: "Internal Server Error" },
      } as any);

      await (deliveryService as any).processOne(
        delivery.id,
        Context.factory({})
      );

      const refreshed = await deliveryRepo.read(delivery.id);
      expect(refreshed.status).toBe(WebhookStatus.FAILED);
      expect(refreshed.errorMessage).toBeDefined();
      expect(refreshed.responseStatus).toBe(500);
    }, 20000);

    it("should handle service unavailable (503)", async () => {
      const { delivery } = await createWebhookFixture(`${serverUrl}/webhook4`);
      jest.spyOn((deliveryService as any).http, "post").mockResolvedValue({
        code: 503,
        data: { error: "Service Unavailable" },
      } as any);

      await (deliveryService as any).processOne(
        delivery.id,
        Context.factory({})
      );

      const refreshed = await deliveryRepo.read(delivery.id);
      expect(refreshed.status).toBe(WebhookStatus.FAILED);
      expect(refreshed.responseStatus).toBe(503);
    }, 20000);

    it("should update event status based on deliveries", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const events = await eventRepo.select().limit(250).execute();
      expect(events.length).toBeGreaterThan(0);
      for (const e of events) {
        expect(e.status).toBeDefined();
        expect(e.deliveriesTotal).toBeGreaterThan(0);
        expect(e.deliveriesSucceeded).toBeDefined();
        expect(e.deliveriesFailed).toBeDefined();
      }
    }, 15000);

    it("should sign webhooks with correct signature", async () => {
      receivedRequests = [];
      const { delivery } = await createWebhookFixture(`${serverUrl}/webhook1`);
      const postSpy = jest
        .spyOn((deliveryService as any).http, "post")
        .mockResolvedValue({
          code: 200,
          data: { status: "ok", endpoint: "/webhook1" },
        } as any);

      await (deliveryService as any).processOne(
        delivery.id,
        Context.factory({})
      );

      expect(postSpy).toHaveBeenCalledTimes(1);
      const [, body, options] = postSpy.mock.calls[0];
      expect(typeof body).toBe("string");
      expect(options?.headers?.["x-webhook-signature"]).toBe(
        signWebhookPayload(delivery.secret, body as string)
      );
      expect(options?.headers?.["x-webhook-topic"]).toBe("product.created");
      expect(options?.headers?.["content-type"]).toBe("application/json");
    }, 15000);

    it("should deactivate subscription", async () => {
      const subs = await subRepo.select().limit(250).execute();
      if (subs.length > 0) {
        const toDeactivate = subs[0];
        await subService.deactivate(toDeactivate.id);
        const updated = await subRepo.read(toDeactivate.id);
        expect(updated.active).toBe(false);
      }
    }, 10000);

    it("should reactivate subscription", async () => {
      const subs = await subRepo
        .select()
        .where(subRepo.attr("active").eq(false))
        .execute();
      if (subs.length > 0) {
        const toReactivate = subs[0];
        await subService.reactivate(toReactivate.id);
        const updated = await subRepo.read(toReactivate.id);
        expect(updated.active).toBe(true);
      }
    }, 10000);

    it("should replay failed deliveries", async () => {
      const failedDeliveries = await deliveryRepo
        .select()
        .where(deliveryRepo.attr("status").eq(WebhookStatus.FAILED))
        .execute();

      if (failedDeliveries.length > 0) {
        const toReplay = failedDeliveries[0];
        await deliveryService.replayEvent(
          toReplay.eventId,
          Context.factory({})
        );

        const replayed = await deliveryRepo
          .select()
          .where(deliveryRepo.attr("eventId").eq(toReplay.eventId))
          .limit(250)
          .execute();
        expect(replayed.length).toBeGreaterThan(0);
        for (const d of replayed) {
          expect(d.attempts).toBe(0);
          expect(d.status).toBe(WebhookStatus.PENDING);
        }
      }
    }, 15000);

    it("should process batch of products", async () => {
      const products = [];
      for (let i = 0; i < 3; i++) {
        products.push(new Product({ classification: `Batch Product ${i}` }));
      }
      await productRepo.createAll(products);

      const events = await eventRepo.select().limit(250).execute();
      expect(events.length).toBeGreaterThan(0);

      const deliveryCount = (await deliveryRepo.select().limit(250).execute())
        .length;
      expect(deliveryCount).toBeGreaterThan(0);
    }, 20000);

    it("should finalize all deliveries", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const allDeliveries = await deliveryRepo.select().limit(250).execute();
      expect(allDeliveries.length).toBeGreaterThan(0);

      const allEvents = await eventRepo.select().limit(250).execute();
      for (const event of allEvents) {
        expect(event.status).toBeDefined();
        expect(event.deliveriesSucceeded).toBeDefined();
        expect(event.deliveriesFailed).toBeDefined();
      }
    }, 15000);
  });
});
