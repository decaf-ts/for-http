export enum WebhookStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  FAILED = "failed",
  PROCESSING = "processing",
  /**
   * Terminal dead-letter state. A delivery lands here once its attempt count
   * reaches `maxAttempts` and it is still failing. It is excluded from the
   * claim query, so it is never re-delivered unless explicitly replayed from
   * the dead-letter queue (see `WebhookDeliveryService.replayEvent`).
   */
  DLQ = "dlq",
}

export const DEFAULT_MAX_ATTEMPTS = 12;

export const DEFAULT_CLAIM_LEASE_MS = 5 * 60_000;

export enum WebhookDeliveryMode {
  POLLING = "polling",
  SYNCHRONOUS = "synchronous",
}

export const WEBHOOK_ADAPTERS_FLAVOURS = Symbol("WEBHOOK_ADAPTERS_FLAVOURS");

export const HookKey = "hook";

export const DefaultHookTopics = ["created", "updated", "deleted", "*"];
