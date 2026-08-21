import { OperationKeys } from "@decaf-ts/db-decorators";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * @description Matches a concrete event topic against a webhook topic pattern
 * @summary Supports the enhanced `<model>.<action|*>.<item id/pk>` form: a bare model
 * name is treated as `<model>.*`, and `*` matches any single segment while a trailing
 * `*` swallows any remaining segments. The global catch-alls `*` and `*.*` match any
 * non-empty topic. A `*` mid-pattern is NOT greedy (it matches exactly one segment),
 * so patterns must align segment-by-segment.
 * @param {string} actual - The concrete `<model>.<action>.<id>` event topic
 * @param {string} pattern - The webhook subscription pattern to match against
 * @returns {boolean} Whether the actual topic matches the pattern
 * @function matchesTopic
 * @memberOf module:for-http.hooks
 * @mermaid
 * sequenceDiagram
 *   participant Caller
 *   participant matches as matchesTopic
 *   Caller->>matches: actual, pattern
 *   alt pattern is "*" or "*.*"
 *     matches-->>Caller: true
 *   else pattern has a single model segment
 *     matches->>matches: treat pattern as "<model>.*"
 *   end
 *   loop over pattern segments
 *     alt segment is trailing "*"
 *       matches-->>Caller: true
 *     else segment is mid "*"
 *       matches->>matches: match exactly one actual segment
 *     else
 *       matches->>matches: actual segment must equal pattern segment
 *     end
 *   end
 *   matches-->>Caller: equal lengths
 */
export function matchesTopic(actual: string, pattern: string): boolean {
  if (!actual || !pattern) return false;
  if (pattern === "*" || pattern === "*.*") return true;

  const actualParts = actual.split(".").filter(Boolean);
  let patternParts = pattern.split(".").filter(Boolean);

  // A bare model name is treated as "<model>.*" — all events for that table.
  if (patternParts.length === 1 && patternParts[0] !== "*") {
    patternParts = [patternParts[0], "*"];
  }

  if (!actualParts.length || !patternParts.length) return false;

  for (let i = 0; i < patternParts.length; i += 1) {
    const part = patternParts[i];
    if (part === "*") {
      // a trailing "*" swallows all remaining actual segments
      if (i === patternParts.length - 1) return true;
      if (actualParts.length <= i) return false;
      continue;
    }
    if (actualParts.length <= i || actualParts[i] !== part) return false;
  }

  return actualParts.length === patternParts.length;
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

type BookmarkPaginator<T> = {
  page: (page?: number, bookmark?: any, ...args: any[]) => Promise<T[]>;
};

export async function collectPagedResults<T>(
  makePaginator: () => Promise<BookmarkPaginator<T>>,
  pageSize: number,
  ...args: any[]
): Promise<T[]> {
  const paginator = await makePaginator();
  const results: T[] = [];
  let bookmark: any = undefined;

  for (;;) {
    const page = await paginator.page(1, bookmark, ...args);
    results.push(...page);
    bookmark = (paginator as any)._bookmark;
    if (page.length < pageSize || !bookmark) break;
  }

  return results;
}
