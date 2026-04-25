import { HttpAdapter } from "../adapter";
import { Axios, AxiosRequestConfig } from "axios";
import { HttpConfig, HttpMethod, HttpRequestOptions } from "../types";
import { AxiosFlags } from "./types";
import {
  BaseError,
  BulkCrudOperationKeys,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import {
  Context,
  MaybeContextualArg,
  PersistenceKeys,
  PreparedStatement,
  PreparedStatementKeys,
} from "@decaf-ts/core";
import { AxiosFlavour } from "./constants";
import { Model } from "@decaf-ts/decorator-validation";
import { Constructor } from "@decaf-ts/decoration";

/**
 * @description Axios implementation of the HTTP adapter
 * @summary Concrete implementation of HttpAdapter using Axios as the HTTP client.
 * This adapter provides CRUD operations for RESTful APIs using Axios for HTTP requests.
 * @template Axios - The Axios client type
 * @template AxiosRequestConfig - The Axios request configuration type
 * @template AxiosFlags - The flags type extending HttpFlags
 * @template Context<AxiosFlags> - The context type for this adapter
 * @param {Axios} native - The Axios instance
 * @param {HttpConfig} config - Configuration for the HTTP adapter
 * @param {string} [alias] - Optional alias for the adapter
 * @class
 * @example
 * ```typescript
 * import axios from 'axios';
 * import { AxiosHttpAdapter } from '@decaf-ts/for-http';
 *
 * const config = { protocol: 'https', host: 'api.example.com' };
 * const adapter = new AxiosHttpAdapter(axios.create(), config);
 *
 * // Use the adapter with a repository
 * const userRepo = adapter.getRepository(User);
 * const user = await userRepo.findById('123');
 * ```
 * @mermaid
 * sequenceDiagram
 *   participant Client
 *   participant AxiosHttpAdapter
 *   participant Axios
 *   participant API
 *
 *   Client->>AxiosHttpAdapter: create(table, id, data)
 *   AxiosHttpAdapter->>AxiosHttpAdapter: url(table)
 *   AxiosHttpAdapter->>Axios: post(url, data)
 *   Axios->>API: HTTP POST Request
 *   API-->>Axios: Response
 *   Axios-->>AxiosHttpAdapter: Response Data
 *   AxiosHttpAdapter-->>Client: Created Resource
 *
 *   Client->>AxiosHttpAdapter: read(table, id)
 *   AxiosHttpAdapter->>AxiosHttpAdapter: url(table, {id})
 *   AxiosHttpAdapter->>Axios: get(url)
 *   Axios->>API: HTTP GET Request
 *   API-->>Axios: Response
 *   Axios-->>AxiosHttpAdapter: Response Data
 *   AxiosHttpAdapter-->>Client: Resource Data
 */
export class AxiosHttpAdapter extends HttpAdapter<
  HttpConfig,
  Axios,
  AxiosRequestConfig,
  PreparedStatement<any>,
  Context<AxiosFlags>
> {
  constructor(config: HttpConfig, alias?: string) {
    super(config, AxiosFlavour, alias);
  }

  protected override getClient(): Axios {
    return new Axios({
      baseURL: `${this.config.protocol}://${this.config.host}`,
    } as AxiosRequestConfig);
  }

  override toRequest(query: PreparedStatement<any>): AxiosRequestConfig;
  override toRequest(ctx: Context<AxiosFlags>): AxiosRequestConfig;
  override toRequest(
    query: PreparedStatement<any>,
    ctx: Context<AxiosFlags>
  ): AxiosRequestConfig;
  override toRequest(
    method: HttpMethod,
    url: string,
    data?: unknown,
    options?: HttpRequestOptions
  ): AxiosRequestConfig;
  override toRequest(
    ctxOrQueryOrMethod: Context<AxiosFlags> | PreparedStatement<any> | HttpMethod,
    ctxOrUrl?: Context<AxiosFlags> | string,
    data?: unknown,
    options?: HttpRequestOptions
  ): AxiosRequestConfig {
    if (typeof ctxOrQueryOrMethod === "string") {
      const req: AxiosRequestConfig = Object.assign(
        {
          method: ctxOrQueryOrMethod,
          url: ctxOrUrl as string,
        },
        this.toAxiosRequestOptions(options)
      );
      if (typeof data !== "undefined") req.data = data;
      return req;
    }

    let query: PreparedStatement<any> | undefined;
    let context: Context<AxiosFlags> | undefined;

    if (ctxOrQueryOrMethod instanceof Context) {
      context = ctxOrQueryOrMethod;
      query = undefined; // In this overload, ctx is actually the query
    } else {
      query = ctxOrQueryOrMethod;
      context = ctxOrUrl as Context<AxiosFlags> | undefined;
    }

    const req: AxiosRequestConfig = {};
    if (context)
      req.headers = { ...(req.headers || {}), ...this.toHeaders(context) };

    if (query) {
      req.method = "GET";
      req.url = this.url(
        query.class,
        [PersistenceKeys.STATEMENT, query.method, ...(query.args || [])],
        query.params as any
      );
    }
    return req;
  }

  private toAxiosRequestOptions(
    options?: HttpRequestOptions
  ): AxiosRequestConfig {
    if (!options) return {};
    const { includeCredentials, ...rest } = options;
    const req: AxiosRequestConfig = Object.assign({}, rest);
    if (
      typeof includeCredentials !== "undefined" &&
      typeof req.withCredentials === "undefined"
    ) {
      req.withCredentials = includeCredentials;
    }
    return req;
  }
  /**
   * @description Sends an HTTP request using Axios
   * @summary Implementation of the abstract request method from HttpAdapter.
   * This method uses the Axios instance to send HTTP requests with the provided configuration.
   * @template V - The response value type
   * @param {AxiosRequestConfig} details - The Axios request configuration
   * @return {Promise<V>} A promise that resolves with the response data
   */
  override async request<V>(
    details: AxiosRequestConfig,
    ...args: MaybeContextualArg<Context<AxiosFlags>>
  ): Promise<V> {
    let overrides = {};
    try {
      const { ctx } = this.logCtx(args, this.request);
      overrides = this.toRequest(ctx);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: unknown) {
      // do nothing
    }

    const response = await this.client.request(
      Object.assign({}, details, overrides)
    );
    return response as V;
  }

  override parseResponse<M extends Model>(
    clazz: Constructor<M>,
    method: OperationKeys | string,
    res: any
  ): any {
    if (!res?.status && method !== PersistenceKeys.STATEMENT) {
      const passthroughMethods = new Set<string>([
        OperationKeys.CREATE,
        OperationKeys.READ,
        OperationKeys.UPDATE,
        OperationKeys.DELETE,
        BulkCrudOperationKeys.CREATE_ALL,
        BulkCrudOperationKeys.READ_ALL,
        BulkCrudOperationKeys.UPDATE_ALL,
        BulkCrudOperationKeys.DELETE_ALL,
      ]);
      if (passthroughMethods.has(String(method))) return res;
      throw new InternalError("this should be impossible");
    }
    if (res.status >= 400)
      throw this.parseError((res.error as Error) || (res.status as any));
    const body = this.normalizeResponseBody(res);
    switch (method) {
      case BulkCrudOperationKeys.CREATE_ALL:
      case BulkCrudOperationKeys.READ_ALL:
      case BulkCrudOperationKeys.UPDATE_ALL:
      case BulkCrudOperationKeys.DELETE_ALL:
      case OperationKeys.CREATE:
      case OperationKeys.READ:
      case OperationKeys.UPDATE:
      case OperationKeys.DELETE:
        return body;
      case PreparedStatementKeys.FIND:
      case PreparedStatementKeys.PAGE:
      case PreparedStatementKeys.FIND_BY:
      case PreparedStatementKeys.LIST_BY:
      case PreparedStatementKeys.PAGE_BY:
      case PreparedStatementKeys.FIND_ONE_BY:
      case PersistenceKeys.STATEMENT:
        return super.parseResponse(clazz, method, body);
      case PreparedStatementKeys.COUNT_OF:
      case PreparedStatementKeys.MAX_OF:
      case PreparedStatementKeys.MIN_OF:
      case PreparedStatementKeys.AVG_OF:
      case PreparedStatementKeys.SUM_OF:
        // These return primitive values, no need to parse as models
        return body;
      case PreparedStatementKeys.DISTINCT_OF:
        // Returns an array of primitive values
        return body;
      case PreparedStatementKeys.GROUP_OF:
        // Returns a Record<string, M[]>, need to parse each group's models
        if (clazz && typeof body === "object" && body !== null) {
          const result: Record<string, M[]> = {};
          for (const [key, value] of Object.entries(body)) {
            if (Array.isArray(value)) {
              result[key] = value.map((d: any) => new clazz(d));
            } else {
              result[key] = value as M[];
            }
          }
          return result;
        }
        return body;
      default:
        return body;
    }
  }

  private normalizeResponseBody(res: any) {
    if (!res) return res;
    const candidate =
      typeof res.body !== "undefined"
        ? res.body
        : typeof res.data !== "undefined"
          ? res.data
          : res;
    if (typeof candidate === "string") {
      try {
        return JSON.parse(candidate);
      } catch {
        return candidate;
      }
    }
    return candidate;
  }

  override parseError<E extends BaseError>(err: Error, ...args: any[]): E {
    return HttpAdapter.parseError(err, ...args);
  }
}
