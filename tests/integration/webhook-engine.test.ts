import { WebhookSubscription } from "../../src/server/hooks/models/WebhookSubscription";
import { WebhookEventRecord } from "../../src/server/hooks/models/WebhookEventRecord";
import { WebhookDelivery } from "../../src/server/hooks/models/WebhookDelivery";
import { WebhookDeliveryMode } from "../../src/server/hooks/constants";
import { NanoAdapter } from "@decaf-ts/for-nano";
import {
  pk,
  Repo,
  createdAt,
  updatedAt,
  createdBy,
  updatedBy,
  Repository,
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
  WebhookPublisherService,
  WebhookSubscriptionService,
} from "../../src/server/index";
import { uses } from "@decaf-ts/decoration";

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

@uses(RamFlavour)
@model()
class Product extends Model<boolean> {
  @pk()
  id!: number;

  @required()
  name!: string;

  @createdAt()
  createdAt!: Date;

  @updatedAt()
  updatedAt!: Date;

  @createdBy()
  createdBy!: string;

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
  let subService: WebhookSubscriptionService;
  let publishService: WebhookPublisherService;
  let deliveryService: WebhookDeliveryService<AxiosHttpAdapter>;

  let server: http.Server;
  let serverUrl: string;
  let receivedRequests: Array<{ url: string; body: any; headers: any }> = [];

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

    const ramAdapter = new RamAdapter({ UUID: "web-hooks" });

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
    await nanoAdapter.initialize();

    publishService = new WebhookPublisherService();
    deliveryService = new WebhookDeliveryService();

    const hookCfg: DeliveryServiceConfig<NanoAdapter> = {
      adapter: nanoAdapter,
      httpAdapter: httpAdapter,
      mode: WebhookDeliveryMode.POLLING,
      autoStart: true,
      models: [Product],
      batchSize: 2,
      pollIntervalMs: 5000,
      // topics: ["product.*"],
      flavours: [RamFlavour],
    };

    await deliveryService.boot(hookCfg);
    subService = new WebhookSubscriptionService();

    productRepo = Repository.forModel(Product as any) as Repo<Product>;
    subRepo = Repository.forModel(
      WebhookSubscription as any
    ) as Repo<WebhookSubscription>;
    eventRepo = Repository.forModel(
      WebhookEventRecord as any
    ) as Repo<WebhookEventRecord>;
    deliveryRepo = Repository.forModel(
      WebhookDelivery as any
    ) as Repo<WebhookDelivery>;
    expect(productRepo).toBeInstanceOf(Repository);
  });

  afterAll(async () => {
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
    for (const createdSub of createdSubs)
      expect(createdSub.hasErrors()).toBeUndefined();
  });

  it("should trigger subscriptions on create", async () => {
    const p = new Product({
      name: "name 1",
    });

    const created = await productRepo.create(p);
    expect(created.hasErrors()).toBeUndefined();
  });
});
