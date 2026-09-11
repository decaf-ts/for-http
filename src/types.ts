import { AdapterFlags, Context } from "@decaf-ts/core";

export type ResponseParser = <
  C extends Context<HttpFlags> = Context<HttpFlags>,
>(
  res: any,
  ctx: C
) => void;

/**
 * @description HTTP configuration type
 * @summary Configuration type for HTTP connections specifying protocol and host
 * @typedef {Object} HttpConfig
 * @property {('http'|'https')} protocol - The HTTP protocol to use
 * @property {string} host - The host address
 * @property {boolean} [idInUrl=true] - When true (default), write operations (create, update) include the resource id (and composed pk parts) in the URL path, matching REST semantics. Set to false to POST/PUT against the collection URL only.
 * @property {Function} [eventHeaderResolver] - Resolves the headers sent on the SSE stream and on the subscribe/unsubscribe calls (called on every (re)connection; non-string values are dropped)
 * @property {EventsReconnectConfig} [eventsReconnect] - Back-off applied when the SSE stream fails or ends
 * @memberOf module:for-http
 */
export type HttpConfig = {
  protocol: "http" | "https";
  host: string;
  parsers?: ResponseParser[];
  eventsListenerPath?: string;
  headers?: boolean;
  events?: boolean;
  eventsSubscription?: boolean;
  eventHeaderResolver?: () =>
    | Promise<Record<string, string>>
    | Record<string, string>;
  eventsReconnect?: EventsReconnectConfig;
  idInUrl?: boolean;
};

/**
 * @description Reconnection back-off of the SSE stream
 * @summary The first reconnection happens after `delayMs`; each consecutive
 * failed attempt doubles it, up to `maxDelayMs`. A stream that was healthy and
 * ended cleanly (e.g. a server restart) reconnects after `delayMs` again.
 * @typedef {Object} EventsReconnectConfig
 * @property {number} [delayMs=1000] - Delay before the first reconnection attempt
 * @property {number} [maxDelayMs=30000] - Upper bound for the delay between attempts
 * @memberOf module:for-http
 */
export type EventsReconnectConfig = {
  delayMs?: number;
  maxDelayMs?: number;
};

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export type HttpRequestTransform = (
  data: any,
  headers?: Record<string, string>
) => any;

/**
 * @description Generic request options for simple HttpAdapter calls
 * @summary for-http owned request options shaped after Axios request config.
 * The adapter maps these options to the underlying client configuration.
 * @interface HttpRequestOptions
 */
export interface HttpRequestOptions {
  timeout?: number;
  headers?: Record<string, any>;
  params?: Record<string, any>;
  baseURL?: string;
  responseType?:
    | "json"
    | "text"
    | "arraybuffer"
    | "blob"
    | "document"
    | "stream";
  auth?: { username: string; password: string };
  signal?: AbortSignal;
  transformRequest?: HttpRequestTransform | HttpRequestTransform[];
  transformResponse?: HttpRequestTransform | HttpRequestTransform[];
  validateStatus?: (status: number) => boolean;
  includeCredentials?: boolean;
  withCredentials?: boolean;
}

/**
 * @description Generic HTTP response shape used by simple HttpAdapter helpers
 * @summary for-http owned response envelope aligned with Axios semantics by default.
 * `code` maps to HTTP status code, `data` to response payload, and `error` to failure details.
 * @interface HttpResponse
 */
export interface HttpResponse<T = any, E = unknown> {
  code: number;
  data?: T;
  error?: E;
}

/**
 * @description HTTP flags interface
 * @summary Interface extending RepositoryFlags with HTTP-specific options
 * @interface HttpFlags
 * @property {Record<string, string>} [headers] - Optional HTTP headers to include with requests
 * @memberOf module:for-http
 */
export interface HttpFlags extends AdapterFlags {
  headers?: Record<string, string>;
}
