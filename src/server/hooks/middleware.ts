import { Context } from "@decaf-ts/core";
import { WebhookSubscription } from "./models/WebhookSubscription";
import { WebhookSignatureMiddlewareConfig, SignatureMiddlewareError } from "./types";
import { signWebhookPayload, verifyWebhookSignature } from "./utils";
import { WebhookSubscriptionService } from "./SubscriptionService";

export interface MiddlewareRequest {
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: any;
  rawBody?: Buffer | string;
  ctx?: Context;
}

export interface MiddlewareResponse {
  status: number;
  headers?: Record<string, string>;
  body?: any;
}

export type NextFunction = () => void | Promise<void>;

export class WebhookSignatureMiddleware {
  private config: WebhookSignatureMiddlewareConfig;

  constructor(config: Partial<WebhookSignatureMiddlewareConfig> = {}) {
    this.config = {
      headerNames: {
        signature: "x-webhook-signature",
        webhookId: "x-webhook-id",
        topic: "x-webhook-topic",
        ...config.headerNames,
      },
      ...config,
    };
  }

  async verify(req: MiddlewareRequest, res: MiddlewareResponse, next: NextFunction): Promise<void> {
    const signatureHeader = this.config.headerNames.signature;
    const headerVal = (req.headers as any)[signatureHeader];
    
    if (!headerVal || typeof headerVal !== "string") {
      res.status = 400;
      res.body = this.formatError("WEBHOOK_SIGNATURE_MISSING", "Webhook signature header is required");
      return;
    }

    const signature = this.extractSignature(headerVal);

    if (!signature) {
      res.status = 400;
      res.body = this.formatError("WEBHOOK_SIGNATURE_INVALID", "Invalid webhook signature format");
      return;
    }

    const endpoint = this.getEndpointFromRequest(req);
    const subscription = await this.lookupSubscription(endpoint, req.ctx);

    if (!subscription) {
      res.status = 401;
      res.body = this.formatError("WEBHOOK_SUBSCRIPTION_NOT_FOUND", "Invalid webhook signature");
      return;
    }

    const rawBody = this.getRequestBody(req);
    const signatureValid = verifyWebhookSignature(
      subscription.secret,
      rawBody,
      signature.value
    );

    if (!signatureValid) {
      res.status = 401;
      res.body = this.formatError("WEBHOOK_SIGNATURE_INVALID", "Invalid webhook signature");
      return;
    }

    next();
  }

  private extractSignature(headerValue: string | string[] | undefined): { algorithm: string; value: string } | null {
    if (!headerValue || typeof headerValue !== "string") return null;

    const signature = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (signature.startsWith("hmac-sha256=")) {
      return {
        algorithm: "sha256",
        value: signature.substring("hmac-sha256=".length),
      };
    }

    if (signature.startsWith("sha256=")) {
      return {
        algorithm: "sha256",
        value: signature.substring("sha256=".length),
      };
    }

    if (/^[a-fA-F0-9]+$/i.test(signature)) {
      return {
        algorithm: "sha256",
        value: signature,
      };
    }

    return null;
  }

  private async lookupSubscription(endpoint: string, context?: Context): Promise<WebhookSubscription | null> {
    const service = new WebhookSubscriptionService();
    const subscriptions = await service.list(context);
    return subscriptions.find((sub: WebhookSubscription) => sub.url === endpoint) || null;
  }

  private getEndpointFromRequest(req: MiddlewareRequest): string {
    if (!req.url) return "";
    
    try {
      const url = new URL(req.url, "http://localhost");
      return url.href.replace(/\/$/, "");
    } catch {
      return req.url.replace(/\/$/, "");
    }
  }

  private getRequestBody(req: MiddlewareRequest): string {
    if (req.rawBody) {
      if (Buffer.isBuffer(req.rawBody)) {
        return req.rawBody.toString("utf8");
      }
      return req.rawBody;
    }
    if (req.body) {
      return JSON.stringify(req.body);
    }
    return "";
  }

  private formatError(code: SignatureMiddlewareError["code"], message: string): { error: SignatureMiddlewareError } {
    return {
      error: {
        code,
        message,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private signWebhookPayload(secret: string, rawBody: string): string {
    return signWebhookPayload(secret, rawBody);
  }

  get headerNames() {
    return this.config.headerNames;
  }
}
