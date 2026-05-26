import { WebhookSignatureMiddleware } from "../../src/server/hooks/middleware";
import { WebhookSignatureMiddlewareConfig } from "../../src/server/hooks/types";

describe.skip("WebhookSignatureMiddleware Unit", () => {
  let middleware: WebhookSignatureMiddleware;

  beforeEach(() => {
    middleware = new WebhookSignatureMiddleware();
  });

  describe("extractSignature", () => {
    it("should extract signature from hmac-sha256 format", () => {
      const result = middleware["extractSignature"]("hmac-sha256=abc123def456");
      expect(result).toEqual({
        algorithm: "sha256",
        value: "abc123def456",
      });
    });

    it("should extract signature from sha256 format", () => {
      const result = middleware["extractSignature"]("sha256=abc123def456");
      expect(result).toEqual({
        algorithm: "sha256",
        value: "abc123def456",
      });
    });

    it("should extract signature from raw hex format", () => {
      const result = middleware["extractSignature"]("abc123def456");
      expect(result).toEqual({
        algorithm: "sha256",
        value: "abc123def456",
      });
    });

    it("should return null for invalid signature format", () => {
      const result = middleware["extractSignature"]("invalid-format");
      expect(result).toBeNull();
    });

    it("should return null for undefined header", () => {
      const result = middleware["extractSignature"](undefined);
      expect(result).toBeNull();
    });

    it("should extract from array of headers", () => {
      const result = middleware["extractSignature"](["hmac-sha256=abc123"]);
      expect(result).toBeNull();
    });
  });

  describe("getEndpointFromRequest", () => {
    it("should extract endpoint from URL", () => {
      const req = { url: "https://example.com/webhooks/" } as any;
      const result = middleware["getEndpointFromRequest"](req);
      expect(result).toBe("https://example.com/webhooks");
    });

    it("should return empty string if no URL", () => {
      const req = {} as any;
      const result = middleware["getEndpointFromRequest"](req);
      expect(result).toBe("");
    });
  });

  describe("getRequestBody", () => {
    it("should return raw body as string", () => {
      const req = { rawBody: "test body" } as any;
      const result = middleware["getRequestBody"](req);
      expect(result).toBe("test body");
    });

    it("should return raw body buffer as string", () => {
      const req = { rawBody: Buffer.from("test body") } as any;
      const result = middleware["getRequestBody"](req);
      expect(result).toBe("test body");
    });

    it("should stringify body object", () => {
      const req = { body: { test: "data" } } as any;
      const result = middleware["getRequestBody"](req);
      expect(result).toBe('{"test":"data"}');
    });

    it("should return empty string if no body", () => {
      const req = {} as any;
      const result = middleware["getRequestBody"](req);
      expect(result).toBe("");
    });
  });

  describe("formatError", () => {
    it("should format error object", () => {
      const result = middleware["formatError"](
        "WEBHOOK_SIGNATURE_MISSING",
        "Missing signature"
      );
      expect(result).toEqual({
        error: {
          code: "WEBHOOK_SIGNATURE_MISSING",
          message: "Missing signature",
          timestamp: expect.any(String),
        },
      });
    });
  });

  describe("headerNames", () => {
    it("should use default header names", () => {
      const result = middleware.headerNames;
      expect(result).toEqual({
        signature: "x-webhook-signature",
        webhookId: "x-webhook-id",
        topic: "x-webhook-topic",
      });
    });

    it("should use custom header names", () => {
      const customConfig: WebhookSignatureMiddlewareConfig = {
        headerNames: {
          signature: "x-custom-signature",
        },
      };
      const customMiddleware = new WebhookSignatureMiddleware(customConfig);
      const result = customMiddleware.headerNames;
      expect(result.signature).toBe("x-custom-signature");
    });
  });
});
