import { Repository } from "@decaf-ts/core";
import { WebhookStatus } from "../../src/server/hooks/constants";
import { NanoAdapter } from "@decaf-ts/for-nano";
import { WebhookDelivery } from "../../src/server/hooks";
import "../../src/server/hooks/overrides";
import { InternalError } from "@decaf-ts/db-decorators";

async function createNanoTestResources() {
  const adminUser = process.env.NANO_ADMIN_USER || "couchdb.admin";
  const adminPassword = process.env.NANO_ADMIN_PASSWORD || "couchdb.admin";
  const dbHost = process.env.NANO_HOST || "localhost:10010";
  const dbProtocol = (process.env.NANO_PROTOCOL as "http" | "https") || "http";

  const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
    if (
      !(e instanceof Error) ||
      ((e as any).error !== "file_exists" && (e as any).statusCode !== 409)
    ) {
      throw new InternalError(String(e));
    }
  });
  await NanoAdapter.createUser(connection, dbName, user, password).catch(
    (e: any) => {
      if (
        !(e instanceof Error) ||
        ((e as any).error !== "file_exists" && (e as any).statusCode !== 409)
      ) {
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
//
// async function cleanupNanoTestResources(resources: any) {
//   const { connection, dbName, user } = resources;
//   try {
//     await NanoAdapter.deleteDatabase(connection, dbName);
//   } catch (e: any) {
//     if (!(e instanceof Error)) throw e;
//   }
//   try {
//     await NanoAdapter.deleteUser(connection, dbName, user);
//   } catch (e: any) {
//     if (!(e instanceof Error)) throw e;
//   } finally {
//     NanoAdapter.closeConnection(connection);
//   }
// }

let adapter: NanoAdapter;

describe("Webhook indexes", () => {
  beforeAll(async () => {
    const conf = await createNanoTestResources();
    adapter = new NanoAdapter(conf);
    await adapter.initialize();
    await (adapter as any).index(WebhookDelivery);
  }, 120000);

  afterAll(async () => {
    if (!adapter) return;
    const db = (adapter as any)._client;
    try {
      await db.destroyDatabase();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      /* empty */
    }
  }, 10000);

  it("should create and query webhook deliveries with proper indexes", async () => {
    const repo = Repository.forModel(WebhookDelivery);

    const now = new Date();

    const deliveries = [
      new WebhookDelivery({
        eventId: "event1",
        subscriptionId: "sub1",
        topic: "test.created",
        targetUrl: "http://test.com",
        secret: "test-secret",
        attempts: 0,
        maxAttempts: 12,
        nextAttemptAt: new Date(now.getTime() - 1000),
        status: WebhookStatus.PENDING,
      }),
      new WebhookDelivery({
        eventId: "event2",
        subscriptionId: "sub2",
        topic: "test.created",
        targetUrl: "http://test.com",
        secret: "test-secret",
        attempts: 0,
        maxAttempts: 12,
        nextAttemptAt: new Date(now.getTime() - 2000),
        status: WebhookStatus.FAILED,
      }),
      new WebhookDelivery({
        eventId: "event3",
        subscriptionId: "sub3",
        topic: "test.created",
        targetUrl: "http://test.com",
        secret: "test-secret",
        attempts: 0,
        maxAttempts: 12,
        nextAttemptAt: new Date(now.getTime() + 10000),
        status: WebhookStatus.PENDING,
      }),
    ];

    await repo.createAll(deliveries);
    //
    // const ctx = new Context({});
    // ctx.set("user", "test");

    const due = await repo
      .select()
      .where(
        repo
          .attr("status")
          .in([WebhookStatus.PENDING, WebhookStatus.FAILED])
          .and(repo.attr("nextAttemptAt").lte(now))
      )
      .limit(10)
      .execute();

    expect(due.length).toBeGreaterThan(0);
    expect(due[0].eventId).toBe("event2");
  }, 15000);
});
