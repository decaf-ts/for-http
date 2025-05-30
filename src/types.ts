import { RepositoryFlags } from "@decaf-ts/db-decorators";

/**
 * @description HTTP configuration type
 * @summary Configuration type for HTTP connections specifying protocol and host
 * @typedef {Object} HttpConfig
 * @property {('http'|'https')} protocol - The HTTP protocol to use
 * @property {string} host - The host address
 * @memberOf module:for-http
 */
export type HttpConfig = {
  protocol: "http" | "https";
  host: string;
};

/**
 * @description HTTP flags interface
 * @summary Interface extending RepositoryFlags with HTTP-specific options
 * @interface HttpFlags
 * @property {Record<string, string>} [headers] - Optional HTTP headers to include with requests
 * @memberOf module:for-http
 */
export interface HttpFlags extends RepositoryFlags {
  headers?: Record<string, string>;
}
