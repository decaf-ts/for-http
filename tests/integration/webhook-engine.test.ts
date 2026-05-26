import { WebhookSubscription } from "../../src/server/hooks/models/WebhookSubscription";
import { WebhookEventRecord } from "../../src/server/hooks/models/WebhookEventRecord";
import { WebhookDelivery } from "../../src/server/hooks/models/WebhookDelivery";
import { WebhookDeliveryMode } from "../../src/server/hooks/constants";
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
} from "../../src/server/index";
import { Constructor, uses } from "@decaf-ts/decoration";
import { OperationKeys } from "@decaf-ts/db-decorators";

NanoAdapter.decoration();
Model.setBuilder(Model.fromModel);

function randomSuffix() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function createNanoTestResources() {
  const adminUser = process.env.NANO_ADMIN_USER || "couchdb.admin";
  const adminPassword = process.env.NANO_ADMIN_PASSWORD || "couchdb.admin";
  const dbHost = process.env.NANO_HOST || "localhost:10010";
  const dbProtocol = (process.env.NANO_PROTOCOL as "http" | "https") || "http";

  const suffix = randomSuffix();
  const dbName = `webhook_engine9`;
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
      throw e;
    }
  });
  await NanoAdapter.createUser(connection, dbName, user, password).catch(
    (e: any) => {
      if (!(e instanceof Error) || (e as any).error !== "file_exists") {
        throw e;
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
    if (!(e instanceof Error)) throw e;
  }
  try {
    await NanoAdapter.deleteUser(connection, dbName, user);
  } catch (e: any) {
    if (!(e instanceof Error)) throw e;
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

describe.skip("Webhook Engine Full Integration Test", () => {
  let nanoAdapter: NanoAdapter;
  let subRepo: Repo<WebhookSubscription>;
  let eventRepo: Repo<WebhookEventRecord>;
  let deliveryRepo: Repo<WebhookDelivery>;
  let productRepo: Repo<Product>;
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

      const hookCfg: DeliveryServiceConfig<NanoAdapter> = {
        adapter: nanoAdapter,
        httpAdapter: httpAdapter,
        mode: WebhookDeliveryMode.POLLING,
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
            topic: `product.${i === 0 ? "*" : i % 2 === 0 ? "created" : "updated"}`,
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

    it.skip("should trigger subscriptions on product create", async () => {
      const p = new Product({
        classification: "Product A",
      });

      const created = await productRepo.create(p);
      expect(created.hasErrors()).toBeUndefined();
      expect(created.id).toBeDefined();

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const events = await eventRepo.select().execute();
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].topic).toBe("product.created");
    }, 15000);

    it.skip("should create deliveries for matching subscriptions", async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));

      const deliveries = await deliveryRepo.select().execute();
      expect(deliveries.length).toBeGreaterThan(0);
      for (const d of deliveries) {
        expect(d.eventId).toBeDefined();
        expect(d.subscriptionId).toBeDefined();
        expect(d.status).toBe(WebhookDeliveryMode.POLLING);
        expect(d.attempts).toBe(0);
        expect(d.maxAttempts).toBe(12);
      }
    }, 10000);

    it.skip("should process deliveries successfully (200 OK)", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const deliveries = await deliveryRepo
        .select()
        .where(deliveryRepo.attr("targetUrl").like("%webhook1%"))
        .execute();
      expect(deliveries.length).toBeGreaterThan(0);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const refreshed = await deliveryRepo
        .select()
        .where(deliveryRepo.attr("targetUrl").like("%webhook1%"))
        .execute();
      const successful = refreshed.filter(
        (d) => d.status === WebhookDeliveryMode.POLLING
      );
      expect(successful.length).toBeGreaterThan(0);
      for (const d of successful) {
        expect(d.attempts).toBeGreaterThan(0);
        expect(d.responseStatus).toBe(200);
        expect(d.responseBody).toBeDefined();
      }
    }, 20000);

    it.skip("should handle failed deliveries (500 error)", async () => {
      const deliveries = await deliveryRepo
        .select()
        .where(deliveryRepo.attr("targetUrl").like("%webhook3%"))
        .execute();
      expect(deliveries.length).toBeGreaterThan(0);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const refreshed = await deliveryRepo
        .select()
        .where(deliveryRepo.attr("targetUrl").like("%webhook3%"))
        .execute();
      const failed = refreshed.filter((d) => d.targetUrl.includes("/webhook3"));
      expect(failed.length).toBeGreaterThan(0);
      for (const d of failed) {
        expect(d.errorMessage).toBeDefined();
      }
    }, 20000);

    it.skip("should handle service unavailable (503)", async () => {
      const deliveries = await deliveryRepo
        .select()
        .where(deliveryRepo.attr("targetUrl").like("%webhook4%"))
        .execute();
      expect(deliveries.length).toBeGreaterThan(0);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const refreshed = await deliveryRepo
        .select()
        .where(deliveryRepo.attr("targetUrl").like("%webhook4%"))
        .execute();
      const unavailable = refreshed.filter((d) =>
        d.targetUrl.includes("/webhook4")
      );
      expect(unavailable.length).toBeGreaterThan(0);
      for (const d of unavailable) {
        expect(d.responseStatus).toBe(503);
      }
    }, 20000);

    it.skip("should update event status based on deliveries", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const events = await eventRepo.select().execute();
      expect(events.length).toBeGreaterThan(0);
      for (const e of events) {
        expect(e.status).toBeDefined();
        expect(e.deliveriesTotal).toBeGreaterThan(0);
        expect(e.deliveriesSucceeded).toBeDefined();
        expect(e.deliveriesFailed).toBeDefined();
      }
    }, 15000);

    it.skip("should sign webhooks with correct signature", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const requestsWithSignature = receivedRequests.filter(
        (r) => r.headers["x-webhook-signature"]
      );
      expect(requestsWithSignature.length).toBeGreaterThan(0);
      for (const req of requestsWithSignature) {
        expect(req.headers["x-webhook-signature"]).toBeDefined();
        expect(req.headers["x-webhook-topic"]).toBe("product.created");
        expect(req.headers["content-type"]).toBe("application/json");
      }
    }, 15000);

    it.skip("should deactivate subscription", async () => {
      const subs = await subRepo.select().execute();
      if (subs.length > 0) {
        const toDeactivate = subs[0];
        await subService.deactivate(toDeactivate.id);
        const updated = await subRepo.read(toDeactivate.id);
        expect(updated.active).toBe(false);
      }
    }, 10000);

    it.skip("should reactivate subscription", async () => {
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

    it.skip("should replay failed deliveries", async () => {
      const failedDeliveries = await deliveryRepo
        .select()
        .where(deliveryRepo.attr("status").eq(WebhookDeliveryMode.POLLING))
        .execute();

      if (failedDeliveries.length > 0) {
        const toReplay = failedDeliveries[0];
        await deliveryService.replayEvent(toReplay.eventId);

        const replayed = await deliveryRepo.findBy("eventId", toReplay.eventId);
        expect(replayed.length).toBeGreaterThan(0);
        for (const d of replayed) {
          expect(d.attempts).toBe(0);
          expect(d.status).toBe(WebhookDeliveryMode.POLLING);
        }
      }
    }, 15000);

    it.skip("should process batch of products", async () => {
      const products = [];
      for (let i = 0; i < 3; i++) {
        products.push(new Product({ name: `Batch Product ${i}` }));
      }
      await productRepo.createAll(products);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const events = await eventRepo.select().execute();
      expect(events.length).toBeGreaterThan(0);

      const deliveryCount = await deliveryRepo.count().execute();
      expect(deliveryCount).toBeGreaterThan(0);
    }, 20000);

    it.skip("should finalize all deliveries", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const allDeliveries = await deliveryRepo.select().execute();
      expect(allDeliveries.length).toBeGreaterThan(0);

      const allEvents = await eventRepo.select().execute();
      for (const event of allEvents) {
        expect(event.status).toBeDefined();
        expect(event.deliveriesSucceeded).toBeDefined();
        expect(event.deliveriesFailed).toBeDefined();
      }
    }, 15000);
  });
});
