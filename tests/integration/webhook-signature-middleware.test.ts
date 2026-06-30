import { WebhookSignatureMiddleware } from "../../src/server/hooks/middleware";
import { WebhookSubscription } from "../../src/server/hooks/models/WebhookSubscription";
import { signWebhookPayload } from "../../src/server/hooks/utils";
import { WebhookSubscriptionService } from "../../src/server/hooks/SubscriptionService";
import { ConflictError, InternalError, NotFoundError } from "@decaf-ts/db-decorators";
import { NanoAdapter } from "@decaf-ts/for-nano";
import "../../src/server/hooks/overrides";

// Initialize NanoAdapter decoration first
NanoAdapter.decoration();
jest.setTimeout(120000);

async function createNanoTestResources(prefix: string) {
  const adminUser = process.env.NANO_ADMIN_USER || "couchdb.admin";
  const adminPassword = process.env.NANO_ADMIN_PASSWORD || "couchdb.admin";
  const dbHost = process.env.NANO_HOST || "localhost:10010";
  const dbProtocol = (process.env.NANO_PROTOCOL as "http" | "https") || "http";
  const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const dbName = `${prefix}_${suffix}`;
  const user = `${prefix}_user_${suffix}`;
  const password = `${user}_pw`;
  const connection = NanoAdapter.connect(
    adminUser,
    adminPassword,
    dbHost,
    dbProtocol
  );
  await NanoAdapter.createDatabase(connection, dbName).catch((e: any) => {
    if (!(e instanceof ConflictError)) throw new InternalError(String(e));
  });
  await NanoAdapter.createUser(connection, dbName, user, password).catch(
    (e: any) => {
      if (!(e instanceof ConflictError)) throw new InternalError(String(e));
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
    if (!(e instanceof NotFoundError)) throw new InternalError(String(e));
  }
  try {
    await NanoAdapter.deleteUser(connection, dbName, user);
  } catch (e: any) {
    if (!(e instanceof NotFoundError)) throw new InternalError(String(e));
  } finally {
    NanoAdapter.closeConnection(connection);
  }
}

describe("WebhookSignatureMiddleware Integration", () => {
  let resources: Awaited<ReturnType<typeof createNanoTestResources>>;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeAll(async () => {
    resources = await createNanoTestResources("webhook_middleware");
  });

  afterAll(async () => {
    await cleanupNanoTestResources(resources);
  });

  describe("Full Flow", () => {
    it("should verify signature extraction and accept a valid webhook", async () => {
      const middleware = new WebhookSignatureMiddleware();
      const secret = "integration-secret";
      const rawBody = JSON.stringify({ ok: true, id: 1 });
      const signature = signWebhookPayload(secret, rawBody);
      jest
        .spyOn(WebhookSubscriptionService.prototype, "list")
        .mockResolvedValue([
          new WebhookSubscription({
            id: "sub-1",
            topic: "payments.created",
            url: "http://localhost/webhooks/payments",
            secret,
            active: true,
          }),
        ] as any);

      // Directly test signature extraction
      const extracted = middleware["extractSignature"](
        "hmac-sha256=abc123def456"
      );
      expect(extracted).toBeDefined();
      expect(extracted?.algorithm).toBe("sha256");
      expect(extracted?.value).toBe("abc123def456");

      const req = {
        url: "/webhooks/payments",
        headers: {
          "x-webhook-signature": `sha256=${signature}`,
        },
        rawBody: Buffer.from(rawBody),
      };
      const res: any = { status: 0, body: undefined };
      const next = jest.fn();

      await middleware.verify(req as any, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(0);
    });

    it("should reject an invalid webhook signature", async () => {
      const middleware = new WebhookSignatureMiddleware();
      jest
        .spyOn(WebhookSubscriptionService.prototype, "list")
        .mockResolvedValue([
          new WebhookSubscription({
            id: "sub-1",
            topic: "payments.created",
            url: "http://localhost/webhooks/payments",
            secret: "integration-secret",
            active: true,
          }),
        ] as any);

      const req = {
        url: "/webhooks/payments",
        headers: {
          "x-webhook-signature": "sha256=invalid",
        },
        rawBody: Buffer.from(JSON.stringify({ ok: true, id: 1 })),
      };
      const res: any = { status: 0, body: undefined };
      const next = jest.fn();

      await middleware.verify(req as any, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("WEBHOOK_SIGNATURE_INVALID");
    });
  });
});
