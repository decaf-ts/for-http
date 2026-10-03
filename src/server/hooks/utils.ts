import { OperationKeys } from "@decaf-ts/db-decorators";
import { createHmac, timingSafeEqual } from "crypto";
import { isIP } from "net";

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

/**
 * @description Default acceptance window for a timestamped signature.
 * @summary Amount of seconds (in either direction of the signer clock) a
 * `t=...,v1=...` signature must be within to be considered non-replayed. A
 * captured signature older than this window cannot be re-delivered.
 * @memberOf module:for-http.hooks
 */
export const DEFAULT_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

/**
 * @description Registers a webhook signature parsing result.
 * @summary A parsed signature is either a timestamped envelope (`t=<sec>,v1=<hex>`)
 * or a legacy bare-HMAC (`<hex>`). Carries the timestamp and digest when the
 * envelope was present.
 * @typedef {Object} ParsedWebhookSignature
 * @property {number} [timestamp] - The unix timestamp carried by the `t=` component
 * @property {string} [v1] - The hex HMAC digest carried by the `v1=` component
 * @property {string} [legacy] - The bare hex HMAC digest (legacy form, no timestamp)
 * @memberOf module:for-http.hooks
 */
export type ParsedWebhookSignature = {
  timestamp?: number;
  v1?: string;
  legacy?: string;
};

/**
 * @description Signs a webhook payload into a timestamped envelope.
 * @summary Produces a Stripe/Svix-style `t=<unix>,v1=<hmac>` signature where the
 * HMAC is computed over `"<t>.<body>"`. The timestamp makes a captured signature
 * non-replayable: the verifier can reject it once the timestamp falls outside the
 * acceptance window. The raw body for real events embeds the event id in its
 * envelope, so the signature is also bound to the event it protects.
 * @param {string} secret - The shared signing secret
 * @param {string} rawBody - The raw (string) payload body being signed
 * @param {number} [timestamp] - Optional explicit unix timestamp (defaults to now). Useful for tests and replay-window checks.
 * @returns {string} The `t=<unix>,v1=<hex>` signature envelope
 * @function signWebhookPayload
 * @memberOf module:for-http.hooks
 */
export function signWebhookPayload(
  secret: string,
  rawBody: string,
  timestamp?: number
): string {
  const t = timestamp ?? Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret)
    .update(`${t}.${rawBody}`, "utf8")
    .digest("hex");
  return `t=${t},v1=${v1}`;
}

/**
 * @description Parses a webhook signature into its components.
 * @summary Recognizes the timestamped `t=<sec>,v1=<hex>` envelope and the legacy
 * bare `hex` form. Returns `null` for anything unrecognizable.
 * @param {string} signature - The raw signature header value
 * @returns {ParsedWebhookSignature | null} The parsed components, or null
 * @function parseWebhookSignature
 * @memberOf module:for-http.hooks
 */
export function parseWebhookSignature(
  signature: string
): ParsedWebhookSignature | null {
  if (!signature || typeof signature !== "string") return null;

  const envelope = signature.match(/^t=(\d+),v1=([a-fA-F0-9]+)$/);
  if (envelope) {
    return { timestamp: Number(envelope[1]), v1: envelope[2] };
  }

  if (/^[a-fA-F0-9]+$/.test(signature)) {
    return { legacy: signature };
  }

  return null;
}

function signatureMatches(expected: Buffer, received: Buffer): boolean {
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

/**
 * @description Verifies a webhook signature.
 * @summary For a timestamped `t=...,v1=...` envelope it recomputes the HMAC over
 * `"<t>.<body>"` and rejects the signature when the timestamp is outside the
 * configured tolerance window (replay protection). For a legacy bare-HMAC it
 * accepts it read-only (one-release compatibility) by recomputing the HMAC over
 * the body alone. `t=n,v1=<hex>` pairs older than `toleranceSeconds` are rejected
 * so a captured signature cannot be replayed indefinitely.
 * @param {string} secret - The shared signing secret
 * @param {string} rawBody - The raw (string) payload body
 * @param {string} signature - The signature header value
 * @param {Object} [options] - Verification options
 * @param {number} [options.toleranceSeconds] - Replay acceptance window (defaults to {@link DEFAULT_SIGNATURE_TOLERANCE_SECONDS})
 * @returns {boolean} Whether the signature is valid and non-replayed
 * @function verifyWebhookSignature
 * @memberOf module:for-http.hooks
 */
export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signature: string,
  options?: { toleranceSeconds?: number }
): boolean {
  const parsed = parseWebhookSignature(signature);
  if (!parsed) return false;

  if (parsed.timestamp !== undefined && parsed.v1 !== undefined) {
    const now = Math.floor(Date.now() / 1000);
    const tolerance =
      options?.toleranceSeconds ?? DEFAULT_SIGNATURE_TOLERANCE_SECONDS;
    if (Math.abs(now - parsed.timestamp) > tolerance) return false;

    const expected = createHmac("sha256", secret)
      .update(`${parsed.timestamp}.${rawBody}`, "utf8")
      .digest("hex");
    return signatureMatches(Buffer.from(expected, "utf8"), Buffer.from(parsed.v1, "utf8"));
  }

  if (parsed.legacy) {
    const expected = createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("hex");
    return signatureMatches(Buffer.from(expected, "utf8"), Buffer.from(parsed.legacy, "utf8"));
  }

  return false;
}

const IPV4_PRIVATE_RANGES: Array<(octets: number[]) => boolean> = [
  // 127.0.0.0/8 loopback
  (o) => o[0] === 127,
  // 10.0.0.0/8 private
  (o) => o[0] === 10,
  // 169.254.0.0/16 link-local (cloud metadata)
  (o) => o[0] === 169 && o[1] === 254,
  // 172.16.0.0/12 private
  (o) => o[0] === 172 && o[1] >= 16 && o[1] <= 31,
  // 192.168.0.0/16 private
  (o) => o[0] === 192 && o[1] === 168,
  // 0.0.0.0/8 unspecified / "this network"
  (o) => o[0] === 0,
];

/**
 * @description Removes the brackets from a literal IPv6 URL host.
 * @summary `URL.hostname` returns a bracketed literal for IPv6 (e.g. `[::1]`),
 * but `net.isIP` only recognizes the unbracketed form, so the brackets must be
 * stripped before classifying a host as an IPv6/IPv4 literal. Without this a
 * literal IPv6 host (e.g. `[::1]`) falls through both `isIP` branches and the
 * SSRF guard is bypassed.
 * @param {string} host - The hostname produced by `URL.hostname`
 * @returns {string} The unbracketed host
 * @function unbracketHost
 * @memberOf module:for-http.hooks
 */
function unbracketHost(host: string): string {
  if (host.startsWith("[") && host.endsWith("]")) {
    return host.slice(1, -1);
  }
  return host;
}

/**
 * @description Decodes a literal IPv6 host to its 16 octets.
 * @summary Handles `::` compression and an embedded dotted-decimal IPv4 tail
 * (e.g. `::ffff:127.0.0.1`), producing the raw 16 octets of the address. Used to
 * classify IPv6 SSRF ranges correctly (including IPv4-mapped forms in decimal or
 * hex) instead of relying on string-prefix matching, so a hex-form mapped address
 * like `::ffff:7f00:1` cannot evade the guard.
 * @param {string} host - The unbracketed IPv6 literal
 * @returns {number[] | null} The 16 octets, or null when unparseable
 * @function ipv6ToOctets
 * @memberOf module:for-http.hooks
 */
function ipv6ToOctets(host: string): number[] | null {
  if (!host) return null;
  const zone = host.indexOf("%");
  if (zone !== -1) host = host.slice(0, zone);

  const lastColon = host.lastIndexOf(":");
  const tail = host.slice(lastColon + 1);
  if (tail.includes(".")) {
    const octets = tail.split(".").map((o) => Number(o));
    if (
      octets.length !== 4 ||
      octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)
    ) {
      return null;
    }
    const hi = ((octets[0] << 8) | octets[1]).toString(16).padStart(4, "0");
    const lo = ((octets[2] << 8) | octets[3]).toString(16).padStart(4, "0");
    host = host.slice(0, lastColon + 1) + `${hi}:${lo}`;
  }

  const pieces = host.split("::");
  if (pieces.length > 2) return null;

  const left = pieces[0] ? pieces[0].split(":").filter(Boolean) : [];
  const right =
    pieces.length === 2 && pieces[1] ? pieces[1].split(":").filter(Boolean) : [];

  const total = left.length + right.length;
  if (total > 8) return null;

  const zeros = 8 - total;
  if (pieces.length === 1 && zeros !== 0) return null;

  const groups: number[] = [];
  for (const p of left) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(p)) return null;
    groups.push(parseInt(p, 16));
  }
  for (let i = 0; i < zeros; i += 1) groups.push(0);
  for (const p of right) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(p)) return null;
    groups.push(parseInt(p, 16));
  }

  const bytes: number[] = [];
  for (const g of groups) {
    bytes.push((g >> 8) & 0xff, g & 0xff);
  }
  return bytes.length === 16 ? bytes : null;
}

/**
 * @description Extracts the embedded IPv4 address from an IPv4-mapped IPv6 host.
 * @summary Returns the 4-octet IPv4 address when the 16 octets form an
 * IPv4-mapped IPv6 address (`::ffff:a.b.c.d`), else null. This correctly handles
 * both decimal (`::ffff:127.0.0.1`) and hex (`::ffff:7f00:1`) mapped forms.
 * @param {number[]} octets - The 16 octets of the IPv6 address
 * @returns {number[] | null} The 4 IPv4 octets, or null when not mapped
 * @function isIPv4Mapped
 * @memberOf module:for-http.hooks
 */
function isIPv4Mapped(octets: number[]): number[] | null {
  if (octets.length !== 16) return null;
  for (let i = 0; i < 10; i += 1) if (octets[i] !== 0) return null;
  if (octets[10] !== 0xff || octets[11] !== 0xff) return null;
  return octets.slice(12, 16);
}

function isDisallowedIPv4Host(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((p) => {
    const n = Number(p);
    return Number.isInteger(n) && n >= 0 && n <= 255 ? n : NaN;
  });
  if (octets.some((n) => Number.isNaN(n))) return false;
  return IPV4_PRIVATE_RANGES.some((check) => check(octets));
}

const IPV6_DISALLOWED = (host: string): boolean => {
  const h = host.toLowerCase();
  // loopback / unspecified (both the compressed and expanded textual forms)
  if (h === "::1" || h === "::") return true;

  const octets = ipv6ToOctets(h);
  if (!octets) return false;

  // loopback ::1 (expanded textual form, e.g. 0:0:0:0:0:0:0:1)
  if (octets.slice(0, 15).every((o) => o === 0) && octets[15] === 1) {
    return true;
  }
  // unspecified ::
  if (octets.every((o) => o === 0)) return true;

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 / ::ffff:7f00:1) - the embedded v4
  // target must be checked against the IPv4 disallowed ranges (loopback,
  // link-local, private, unspecified, etc.). Both decimal and hex mapped forms
  // are decoded to the 4 embedded octets so neither can evade the guard.
  const mappedV4 = isIPv4Mapped(octets);
  if (mappedV4) return isDisallowedIPv4Host(mappedV4.join("."));

  // link-local fe80::/10
  if (octets[0] === 0xfe && (octets[1] & 0xc0) === 0x80) return true;
  // unique-local fc00::/7 (fc00::/7 => first octet 0xfc or 0xfd)
  if ((octets[0] & 0xfe) === 0xfc) return true;

  return false;
};

/**
 * @description Determines whether a webhook target URL is a disallowed SSRF pivot.
 * @summary Returns true for non-http(s) schemes and for hosts that resolve to a
 * loopback, link-local, private (RFC 1918), unspecified or IPv6 equivalent range.
 * This is the SSRF guard applied before issuing an outbound webhook delivery.
 * Hostnames are not resolved (no DNS rebinding defence) - only literal IP hosts in
 * the disallowed ranges are rejected.
 * @param {string} url - The target URL (subscription url or delivery targetUrl)
 * @returns {boolean} Whether the target is disallowed (must not be delivered to)
 * @function isDisallowedWebhookTarget
 * @memberOf module:for-http.hooks
 */
export function isDisallowedWebhookTarget(url: string): boolean {
  if (!url) return true;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }

  const scheme = parsed.protocol.replace(":", "").toLowerCase();
  if (scheme !== "http" && scheme !== "https") return true;

  const rawHost = parsed.hostname;
  if (!rawHost) return true;

  // `URL.hostname` returns a bracketed literal for IPv6 (e.g. `[::1]`), which
  // `net.isIP` treats as neither IPv4 nor IPv6. Strip the brackets first so a
  // literal IPv6 host cannot fall through to the (allowed) hostname branch.
  const host = unbracketHost(rawHost);

  if (isIP(host) === 4) return isDisallowedIPv4Host(host);
  if (isIP(host) === 6) return IPV6_DISALLOWED(host);

  return false;
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
