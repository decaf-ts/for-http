import { WebhookSubscription } from "../../src/server/hooks/models/WebhookSubscription";
import { WebhookEventRecord } from "../../src/server/hooks/models/WebhookEventRecord";
import { WebhookDelivery } from "../../src/server/hooks/models/WebhookDelivery";
import { WebhookStatus, WebhookDeliveryMode, HookKey } from "../../src/server/hooks/constants";
import { NanoAdapter } from "@decaf-ts/for-nano";
import { Model } from "@decaf-ts/decorator-validation";
import { Repository, Repo, Adapter } from "@decaf-ts/core";
import { AxiosHttpAdapter } from "../../src/axios/axios";
import { Context } from "@decaf-ts/core";
import { Logging } from "@decaf-ts/logging";
import { WebhookObserver } from "../../src/server/hooks/observers";
import { WebhookDeliveryService } from "../../src/server/hooks/DeliveryService";
import type { AxiosRequestConfig } from "axios";
import { HttpResponse } from "../../src/types";

Model.setBuilder(Model.fromModel);
NanoAdapter.decoration();

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

describe("Webhook Engine Full Integration Test", () => {
  beforeAll(async () => {
    resources = await createNanoTestResources();
  });

  afterAll(async () => {
    await cleanupNanoTestResources(resources);
  });

  let subRepo: Repo<WebhookSubscription>;
  let eventRepo: Repo<WebhookEventRecord>;
  let deliveryRepo: Repo<WebhookDelivery>;

  beforeAll(async () => {
    const nanoAdapter = new NanoAdapter(
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

    subRepo = Repository.forModel(WebhookSubscription);
    eventRepo = Repository.forModel(WebhookEventRecord);
    deliveryRepo = Repository.forModel(WebhookDelivery);
  });

  let now: Date;
  let sub1: WebhookSubscription;
  let createdSub1: WebhookSubscription;
  let event: WebhookEventRecord;
  let createdEvent: WebhookEventRecord;
  let delivery: WebhookDelivery;
  let createdDelivery: WebhookDelivery;

  beforeAll(() => {
    now = new Date();
  });

  beforeAll(async () => {
    sub1 = new WebhookSubscription({
      topic: "user.created",
      url: "http://localhost:9999/webhook",
      secret: "test-secret",
      active: true,
    });

    createdSub1 = await subRepo.create(sub1);
  });

  beforeAll(async () => {
    event = new WebhookEventRecord({
      topic: "user.created",
      model: "user",
      action: "created",
      entityId: "user-123",
      payload: JSON.stringify({ id: "user-123", name: "Test" }),
      status: WebhookStatus.PENDING,
      deliveriesTotal: 1,
      deliveriesSucceeded: 0,
      deliveriesFailed: 0,
      nextAttemptAt: now,
    });

    createdEvent = await eventRepo.create(event);
  });

  beforeAll(async () => {
    delivery = new WebhookDelivery({
      eventId: createdEvent.id,
      subscriptionId: createdSub1.id,
      topic: "user.created",
      targetUrl: "http://localhost:9999/webhook",
      secret: "test-secret",
      status: WebhookStatus.PENDING,
      attempts: 0,
      maxAttempts: 3,
      nextAttemptAt: now,
      lastAttemptAt: now,
      responseStatus: undefined,
      responseBody: undefined,
      errorMessage: undefined,
    });

    createdDelivery = await deliveryRepo.create(delivery);
  });

  it("should create webhook models with auto-generated UUIDs", async () => {
    expect(createdSub1.id).toBeDefined();
    expect(createdEvent.id).toBeDefined();
    expect(createdDelivery.id).toBeDefined();
  });

  it("should handle successful webhook delivery (200 OK)", async () => {
    const ctx = new Context().accumulate({ logger: Logging.get() });
    
    class MockAxiosAdapter extends AxiosHttpAdapter {
      protected override async request<V>(details: any): Promise<HttpResponse<V>> {
        return { status: 200, data: "OK", error: undefined } as any;
      }
    }

    const deliveryService = new WebhookDeliveryService<AxiosHttpAdapter>();
    
    await deliveryService.initialize(
      {
        adapter: MockAxiosAdapter,
        config: { protocol: "http", host: "localhost", port: 9999 },
        mode: WebhookDeliveryMode.POLLING,
        batchSize: 10,
        pollIntervalMs: 100,
        topics: ["user.created"],
        models: [],
        flavours: [],
        observer: WebhookObserver,
      },
      ctx
    );

    await deliveryService["processOne"](createdDelivery.id, ctx);

    const updatedDelivery = await deliveryRepo.read(createdDelivery.id);
    expect(updatedDelivery!.status).toBe(WebhookStatus.COMPLETED);
    expect(updatedDelivery!.attempts).toBe(1);
    expect(updatedDelivery!.responseStatus).toBe(200);
    expect(updatedDelivery!.responseBody).toBe("OK");
  });

  it("should handle webhook delivery failure (500 error)", async () => {
    const ctx = new Context().accumulate({ logger: Logging.get() });
    
    class MockAxiosAdapter extends AxiosHttpAdapter {
      protected override async request<V>(details: any): Promise<HttpResponse<V>> {
        return { status: 500, data: "Internal Server Error", error: undefined } as any;
      }
    }

    const deliveryService = new WebhookDeliveryService<AxiosHttpAdapter>();
    
    await deliveryService.initialize(
      {
        adapter: MockAxiosAdapter,
        config: { protocol: "http", host: "localhost", port: 9999 },
        mode: WebhookDeliveryMode.POLLING,
        batchSize: 10,
        pollIntervalMs: 100,
        topics: ["user.created"],
        models: [],
        flavours: [],
        observer: WebhookObserver,
      },
      ctx
    );

    await deliveryService["processOne"](createdDelivery.id, ctx);

    const updatedDelivery = await deliveryRepo.read(createdDelivery.id);
    expect(updatedDelivery!.status).toBe(WebhookStatus.FAILED);
    expect(updatedDelivery!.attempts).toBe(1);
    expect(updatedDelivery!.responseStatus).toBe(500);
  });

  it("should handle webhook delivery network error", async () => {
    const ctx = new Context().accumulate({ logger: Logging.get() });
    
    class MockAxiosAdapter extends AxiosHttpAdapter {
      protected override async request<V>(details: any): Promise<HttpResponse<V>> {
        throw new Error("Network Error");
      }
    }

    const deliveryService = new WebhookDeliveryService<AxiosHttpAdapter>();
    
    await deliveryService.initialize(
      {
        adapter: MockAxiosAdapter,
        config: { protocol: "http", host: "localhost", port: 9999 },
        mode: WebhookDeliveryMode.POLLING,
        batchSize: 10,
        pollIntervalMs: 100,
        topics: ["user.created"],
        models: [],
        flavours: [],
        observer: WebhookObserver,
      },
      ctx
    );

    await deliveryService["processOne"](createdDelivery.id, ctx);

    const updatedDelivery = await deliveryRepo.read(createdDelivery.id);
    expect(updatedDelivery!.status).toBe(WebhookStatus.FAILED);
    expect(updatedDelivery!.attempts).toBe(1);
    expect(updatedDelivery!.errorMessage).toContain("Network Error");
  });

  it("should verify webhook signature is included in request", async () => {
    let capturedSignature: string | undefined;
    const ctx = new Context().accumulate({ logger: Logging.get() });
    
    class MockAxiosAdapter extends AxiosHttpAdapter {
      protected override async request<V>(details: any): Promise<HttpResponse<V>> {
        capturedSignature = details.headers["x-webhook-signature"];
        return { status: 200, data: "OK", error: undefined } as any;
      }
    }

    const deliveryService = new WebhookDeliveryService<AxiosHttpAdapter>();
    
    await deliveryService.initialize(
      {
        adapter: MockAxiosAdapter,
        config: { protocol: "http", host: "localhost", port: 9999 },
        mode: WebhookDeliveryMode.POLLING,
        batchSize: 10,
        pollIntervalMs: 100,
        topics: ["user.created"],
        models: [],
        flavours: [],
        observer: WebhookObserver,
      },
      ctx
    );

    await deliveryService["processOne"](createdDelivery.id, ctx);

    expect(capturedSignature).toBeDefined();
    expect(capturedSignature!.startsWith("hmac-sha256=")).toBe(true);
  });

  it("should include webhook headers in request", async () => {
    let capturedHeaders: Record<string, string> | undefined;
    const ctx = new Context().accumulate({ logger: Logging.get() });
    
    class MockAxiosAdapter extends AxiosHttpAdapter {
      protected override async request<V>(details: any): Promise<HttpResponse<V>> {
        capturedHeaders = details.headers;
        return { status: 200, data: "OK", error: undefined } as any;
      }
    }

    const deliveryService = new WebhookDeliveryService<AxiosHttpAdapter>();
    
    await deliveryService.initialize(
      {
        adapter: MockAxiosAdapter,
        config: { protocol: "http", host: "localhost", port: 9999 },
        mode: WebhookDeliveryMode.POLLING,
        batchSize: 10,
        pollIntervalMs: 100,
        topics: ["user.created"],
        models: [],
        flavours: [],
        observer: WebhookObserver,
      },
      ctx
    );

    await deliveryService["processOne"](createdDelivery.id, ctx);

    expect(capturedHeaders).toBeDefined();
    expect(capturedHeaders!["x-webhook-id"]).toBe(createdEvent.id);
    expect(capturedHeaders!["x-webhook-topic"]).toBe("user.created");
    expect(capturedHeaders!["content-type"]).toBe("application/json");
  });
});
