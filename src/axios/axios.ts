import { HttpAdapter } from "../adapter";
import { Axios, AxiosRequestConfig } from "axios";
import { HttpConfig, HttpQuery } from "../types";
import { AxiosFlags } from "./types";
import { BaseError, Context, PrimaryKeyType } from "@decaf-ts/db-decorators";
import {
  ContextualArgs,
  MaybeContextualArg,
  PersistenceKeys,
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
  HttpQuery,
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

  override toRequest(query: HttpQuery): AxiosRequestConfig;
  override toRequest(ctx: Context<AxiosFlags>): AxiosRequestConfig;
  override toRequest(
    query: HttpQuery,
    ctx: Context<AxiosFlags>
  ): AxiosRequestConfig;
  override toRequest(
    ctxOrQuery: Context<AxiosFlags> | HttpQuery,
    ctx?: Context<AxiosFlags>
  ): AxiosRequestConfig {
    let query: HttpQuery | undefined;
    let context: Context<AxiosFlags> | undefined;

    if (ctxOrQuery instanceof Context) {
      context = ctxOrQuery;
      query = undefined; // In this overload, ctx is actually the query
    } else {
      query = ctxOrQuery;
      context = ctx;
    }

    const req: AxiosRequestConfig = {};
    if (context) {
      try {
        req.headers = context.get("headers") || {};
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e: unknown) {
        // do nothing
      }
    }
    if (query) {
      req.method = "GET";
      req.url = this.url(
        query.class,
        [PersistenceKeys.STATEMENT, query.method, ...query.args],
        query.params as any
      );
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
    return this.client.request(Object.assign({}, details, overrides));
  }

  /**
   * @description Creates a new resource via HTTP POST
   * @summary Implementation of the abstract create method from HttpAdapter.
   * This method sends a POST request to the specified endpoint with the model data.
   * @param {string} tableName - The name of the table or endpoint
   * @param {string|number} id - The identifier for the resource (not used in URL for POST)
   * @param {Record<string, any>} model - The data model to create
   * @return {Promise<Record<string, any>>} A promise that resolves with the created resource
   */
  override async create<M extends Model>(
    tableName: Constructor<M> | string,
    id: PrimaryKeyType,
    model: Record<string, any>,
    ...args: ContextualArgs<Context<AxiosFlags>>
  ): Promise<Record<string, any>> {
    const { log, ctx } = this.logCtx(args, this.create);
    try {
      const url = this.url(tableName);
      const cfg = this.toRequest(ctx);
      log.debug(
        `POSTing to ${url} with ${JSON.stringify(model)} and cfg ${JSON.stringify(cfg)}`
      );
      return this.client.post(url, model, cfg);
    } catch (e: any) {
      throw this.parseError(e);
    }
  }
  /**
   * @description Retrieves a resource by ID via HTTP GET
   * @summary Implementation of the abstract read method from HttpAdapter.
   * This method sends a GET request to the specified endpoint with the ID as a query parameter.
   * @param {string} tableName - The name of the table or endpoint
   * @param {string|number|bigint} id - The identifier for the resource to retrieve
   * @return {Promise<Record<string, any>>} A promise that resolves with the retrieved resource
   */
  override async read<M extends Model>(
    tableName: Constructor<M> | string,
    id: PrimaryKeyType,
    ...args: ContextualArgs<Context<AxiosFlags>>
  ): Promise<Record<string, any>> {
    const { log, ctx } = this.logCtx(args, this.read);
    try {
      const url = this.url(tableName, [id as string]);
      const cfg = this.toRequest(ctx);
      log.debug(`GETing from ${url} and cfg ${JSON.stringify(cfg)}`);
      return this.client.get(url);
    } catch (e: any) {
      throw this.parseError(e);
    }
  }

  /**
   * @description Updates an existing resource via HTTP PUT
   * @summary Implementation of the abstract update method from HttpAdapter.
   * This method sends a PUT request to the specified endpoint with the updated model data.
   * @param {string} tableName - The name of the table or endpoint
   * @param {string|number} id - The identifier for the resource (not used in URL for PUT)
   * @param {Record<string, any>} model - The updated data model
   * @return {Promise<Record<string, any>>} A promise that resolves with the updated resource
   */
  override async update<M extends Model>(
    tableName: Constructor<M> | string,
    id: PrimaryKeyType,
    model: Record<string, any>,
    ...args: ContextualArgs<Context<AxiosFlags>>
  ): Promise<Record<string, any>> {
    const { log, ctx } = this.logCtx(args, this.update);
    try {
      const url = this.url(tableName, [id as string]);
      const cfg = this.toRequest(ctx);
      log.debug(
        `PUTing to ${url} with ${JSON.stringify(model)} and cfg ${JSON.stringify(cfg)}`
      );
      return this.client.put(url, model);
    } catch (e: any) {
      throw this.parseError(e);
    }
  }

  /**
   * @description Deletes a resource by ID via HTTP DELETE
   * @summary Implementation of the abstract delete method from HttpAdapter.
   * This method sends a DELETE request to the specified endpoint with the ID as a query parameter.
   * @param {string} tableName - The name of the table or endpoint
   * @param {string|number|bigint} id - The identifier for the resource to delete
   * @return {Promise<Record<string, any>>} A promise that resolves with the deletion result
   */
  override async delete<M extends Model>(
    tableName: Constructor<M> | string,
    id: PrimaryKeyType,
    ...args: ContextualArgs<Context<AxiosFlags>>
  ): Promise<Record<string, any>> {
    const { log, ctx } = this.logCtx(args, this.delete);
    try {
      const url = this.url(tableName, [id as string]);
      const cfg = this.toRequest(ctx);
      log.debug(`DELETEing from ${url} and cfg ${JSON.stringify(cfg)}`);
      return this.client.delete(url);
    } catch (e: any) {
      throw this.parseError(e);
    }
  }

  override parseError<E extends BaseError>(err: Error, ...args: any[]): E {
    return HttpAdapter.parseError(err, ...args);
  }
}
