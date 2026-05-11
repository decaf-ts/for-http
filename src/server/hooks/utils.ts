import { OperationKeys } from "@decaf-ts/db-decorators";
import { createHmac, timingSafeEqual } from "crypto";

export function matchesTopic(actual: string, pattern: string): boolean {
  if (pattern === "*.*") return true;

  const [actualEntity, actualAction] = actual.split(".");
  const [patternEntity, patternAction] = pattern.split(".");

  if (!actualEntity || !actualAction || !patternEntity || !patternAction) {
    return false;
  }

  const entityOk = patternEntity === "*" || patternEntity === actualEntity;
  const actionOk = patternAction === "*" || patternAction === actualAction;

  return entityOk && actionOk;
}

export function signWebhookPayload(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signature: string
): boolean {
  const expected = Buffer.from(signWebhookPayload(secret, rawBody), "utf8");
  const received = Buffer.from(signature, "utf8");

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}

export function computeNextAttempt(attempts: number): Date {
  // 30s, 1m, 2m, 4m, 8m, 16m...
  const delayMs = Math.min(
    30_000 * Math.pow(2, Math.max(attempts - 1, 0)),
    30 * 60_000
  );
  return new Date(Date.now() + delayMs);
}

export function keyToTopic(key: OperationKeys): string {
  return key.toLowerCase() + "d";
}
