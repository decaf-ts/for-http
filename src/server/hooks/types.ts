import { Constructor } from "@decaf-ts/decoration";
import { WebhookDeliveryMode } from "./constants";
import { Adapter, ConfigOf } from "@decaf-ts/core";
import { WebhookObserver } from "./observers";
import { Model } from "@decaf-ts/decorator-validation";
import { HttpAdapter } from "../../adapter";
import { HttpConfig } from "../../types";

export type WebhookAction = "created" | "updated" | "deleted" | "*" | string;

export type WebhookTopic = `${string}.${WebhookAction}` | `.*`;

export interface WebhookEnvelope<TPayload = unknown> {
  id: string;
  topic: WebhookTopic;
  entity: string;
  action: WebhookAction;
  entityId: string;
  occurredAt: string;
  payload: TPayload;
}

export type DeliveryServiceConfig<A extends Adapter<any, any, any, any>> = {
  adapter: A | Constructor<A>;
  config?: ConfigOf<A>;
  httpAdapter?:
    | HttpAdapter<any, any, any, any, any>
    | Constructor<HttpAdapter<any, any, any, any>>;
  httpConfig?: HttpConfig;
  autoStart: boolean;
  mode: WebhookDeliveryMode;
  batchSize?: number;
  pollIntervalMs?: number;
  topics?: string[];
  models: Constructor<Model<boolean>>[];
  flavours: string[];
  observer?: Constructor<WebhookObserver>;
  callback?: (adapter: A, ...args: any) => void;
  allowWildcard?: boolean;
};

export interface WebhookSignatureMiddlewareConfig {
  logging?: {
    enabled?: boolean;
    level?: "debug" | "info" | "error";
    includePayloadHash?: boolean;
  };
  headerNames: {
    signature: string;
    webhookId: string;
    topic: string;
  };
  fallbackToPublicKey?: boolean;
}

export interface SignatureMiddlewareError {
  code:
    | "WEBHOOK_SIGNATURE_MISSING"
    | "WEBHOOK_SIGNATURE_INVALID"
    | "WEBHOOK_SUBSCRIPTION_NOT_FOUND";
  message: string;
  timestamp: string;
  requestId?: string;
}
