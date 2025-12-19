import { AdapterFlags } from "@decaf-ts/core";
import { ResponseParser } from "./ResponseParser";

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
  responseParser?: ResponseParser;
};

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
