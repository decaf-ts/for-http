import { Constructor } from "@decaf-ts/decoration";
import { WebhookDeliveryMode } from "./constants";
import { ConfigOf } from "@decaf-ts/core";
import { WebhookObserver } from "./observers";
import { Model } from "@decaf-ts/decorator-validation";
import { HttpAdapter } from "../../adapter";

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

export type DeliveryServiceConfig<
  A extends HttpAdapter<any, any, any, any, any>,
> = {
  adapter: Constructor<A>;
  config: ConfigOf<A>;
  autoStart: boolean;
  mode: WebhookDeliveryMode;
  batchSize?: number;
  pollIntervalMs?: number;
  topics: string[];
  models: Model[];
  flavours: string[];
  observer: Constructor<WebhookObserver>;
};
