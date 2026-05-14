export enum WebhookStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  FAILED = "failed",
  PROCESSING = "processing",
}

export enum WebhookDeliveryMode {
  POLLING = "polling",
  SYNCHRONOUS = "synchronous",
}

export const WEBHOOK_ADAPTERS_FLAVOURS = Symbol("WEBHOOK_ADAPTERS_FLAVOURS");

export const HookKey = "hook";

export const DefaultHookTopics = ["created", "updated", "deleted", "*"];
