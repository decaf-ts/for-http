import { HttpAdapter } from "../adapter";
import { Axios, AxiosRequestConfig } from "axios";
import { HttpConfig } from "../types";
import { AxiosFlags } from "./types";
import {
  BaseError,
  BulkCrudOperationKeys,
  InternalError,
  OperationKeys,
  PrimaryKeyType,
} from "@decaf-ts/db-decorators";
import {
  Context,
  ContextualArgs,
  PersistenceKeys,
  PreparedStatement,
  PreparedStatementKeys,
} from "@decaf-ts/core";
import { AxiosFlavour } from "./constants";
import { Model, ModelKeys } from "@decaf-ts/decorator-validation";
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
    ctxOrQuery: Context<AxiosFlags> | PreparedStatement<any>,
    ctx?: Context<AxiosFlags>
  ): AxiosRequestConfig {
    let query: PreparedStatement<any> | undefined;
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
        [PersistenceKeys.STATEMENT, query.method, ...(query.args || [])],
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
    ...args: ContextualArgs<Context<AxiosFlags>>
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
    if (!res.status && method !== PersistenceKeys.STATEMENT)
      throw new InternalError("this should be impossible");
    if (res.status >= 400)
      throw this.parseError((res.error as Error) || (res.status as any));
    switch (method) {
      case BulkCrudOperationKeys.CREATE_ALL:
      case BulkCrudOperationKeys.READ_ALL:
      case BulkCrudOperationKeys.UPDATE_ALL:
      case BulkCrudOperationKeys.DELETE_ALL:
      case OperationKeys.CREATE:
      case OperationKeys.READ:
      case OperationKeys.UPDATE:
      case OperationKeys.DELETE:
        return res.body;
      case PreparedStatementKeys.FIND:
      case PreparedStatementKeys.PAGE:
      case PreparedStatementKeys.FIND_BY:
      case PreparedStatementKeys.LIST_BY:
      case PreparedStatementKeys.PAGE_BY:
      case PreparedStatementKeys.FIND_ONE_BY:
      case PersistenceKeys.STATEMENT:
        return super.parseResponse(clazz, method, res.body);
      case PreparedStatementKeys.COUNT_OF:
      case PreparedStatementKeys.MAX_OF:
      case PreparedStatementKeys.MIN_OF:
      case PreparedStatementKeys.AVG_OF:
      case PreparedStatementKeys.SUM_OF:
        // These return primitive values, no need to parse as models
        return res.body;
      case PreparedStatementKeys.DISTINCT_OF:
        // Returns an array of primitive values
        return res.body;
      case PreparedStatementKeys.GROUP_OF:
        // Returns a Record<string, M[]>, need to parse each group's models
        if (clazz && typeof res.body === "object" && res.body !== null) {
          const result: Record<string, M[]> = {};
          for (const [key, value] of Object.entries(res.body)) {
            if (Array.isArray(value)) {
              result[key] = value.map((d: any) => new clazz(d));
            } else {
              result[key] = value as M[];
            }
          }
          return result;
        }
        return res.body;
      default:
        return res;
    }
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
    tableName: Constructor<M>,
    id: PrimaryKeyType,
    model: M,
    ...args: ContextualArgs<Context<AxiosFlags>>
  ): Promise<Record<string, any>> {
    const { log, ctx } = this.logCtx(args, this.create);
    try {
      const url = this.url(
        tableName,
        this.extractIdArgs(tableName, id as string)
      );
      const cfg = this.toRequest(ctx);
      log.debug(
        `POSTing to ${url} with ${JSON.stringify(model)} and cfg ${JSON.stringify(cfg)}`
      );
      const result = await this.request(
        {
          url,
          method: "POST",
          data: JSON.stringify(
            Object.assign({}, model, {
              [ModelKeys.ANCHOR]: tableName.name,
            })
          ),
          ...cfg,
        },
        ctx
      );
      return result as any;
    } catch (e: any) {
      throw this.parseError(e);
    }
  }

  override async createAll<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType[],
    model: M[],
    ...args: ContextualArgs<Context<AxiosFlags>>
  ): Promise<Record<string, any>[]> {
    const { log, ctx } = this.logCtx(args, this.createAll);
    try {
      const url = this.url(clazz, ["bulk"]);
      const cfg = this.toRequest(ctx);
      log.debug(
        `POSTing to ${url} with ${JSON.stringify(model)} and cfg ${JSON.stringify(cfg)}`
      );
      return this.request(
        {
          url,
          method: "POST",
          data: JSON.stringify(
            model.map((m: M) =>
              Object.assign({}, m, {
                [ModelKeys.ANCHOR]: clazz.name,
              })
            )
          ),
          ...cfg,
        },
        ctx
      );
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
      const url = this.url(
        tableName,
        this.extractIdArgs(tableName, id as string)
      );
      const cfg = this.toRequest(ctx);
      log.debug(`GETing from ${url} and cfg ${JSON.stringify(cfg)}`);
      return await this.request({ url, method: "GET", ...cfg }, ctx);
    } catch (e: any) {
      throw this.parseError(e);
    }
  }
  override async readAll<M extends Model>(
    tableName: Constructor<M> | string,
    ids: PrimaryKeyType[],
    ...args: ContextualArgs<Context<AxiosFlags>>
  ): Promise<Record<string, any>[]> {
    const { log, ctx } = this.logCtx(args, this.readAll);
    try {
      const url = this.url(tableName, ["bulk"], { ids: ids } as any);
      const cfg = this.toRequest(ctx);
      log.debug(`GETing from ${url} and cfg ${JSON.stringify(cfg)}`);
      return await this.request({ url, method: "GET", ...cfg }, ctx);
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
    tableName: Constructor<M>,
    id: PrimaryKeyType,
    model: Record<string, any>,
    ...args: ContextualArgs<Context<AxiosFlags>>
  ): Promise<Record<string, any>> {
    const { log, ctx } = this.logCtx(args, this.update);
    try {
      const url = this.url(
        tableName,
        this.extractIdArgs(tableName, id as string)
      );
      const cfg = this.toRequest(ctx);
      log.debug(
        `PUTing to ${url} with ${JSON.stringify(model)} and cfg ${JSON.stringify(cfg)}`
      );
      return await this.request(
        {
          url,
          method: "PUT",
          data: JSON.stringify(
            Object.assign({}, model, {
              [ModelKeys.ANCHOR as keyof typeof model]: tableName.name,
            })
          ),
          ...cfg,
        },
        ctx
      );
    } catch (e: any) {
      throw this.parseError(e);
    }
  }

  override async updateAll<M extends Model>(
    tableName: Constructor<M>,
    ids: PrimaryKeyType[],
    model: M[],
    ...args: ContextualArgs<Context<AxiosFlags>>
  ): Promise<Record<string, any>[]> {
    const { log, ctx } = this.logCtx(args, this.updateAll);
    try {
      const url = this.url(tableName, ["bulk"]);
      const cfg = this.toRequest(ctx);
      log.debug(
        `PUTing to ${url} with ${JSON.stringify(model)} and cfg ${JSON.stringify(cfg)}`
      );
      return this.request(
        {
          url,
          method: "PUT",
          data: JSON.stringify(
            model.map((m: M) =>
              Object.assign({}, m, {
                [ModelKeys.ANCHOR]: tableName.name,
              })
            )
          ),
          ...cfg,
        },
        ctx
      );
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
      const url = this.url(
        tableName,
        this.extractIdArgs(tableName, id as string)
      );
      const cfg = this.toRequest(ctx);
      log.debug(`DELETEing from ${url} and cfg ${JSON.stringify(cfg)}`);
      return await this.request({ url, method: "DELETE", ...cfg }, ctx);
    } catch (e: any) {
      throw this.parseError(e);
    }
  }

  override async deleteAll<M extends Model>(
    tableName: Constructor<M> | string,
    ids: PrimaryKeyType[],
    ...args: ContextualArgs<Context<AxiosFlags>>
  ): Promise<Record<string, any>[]> {
    const { log, ctx } = this.logCtx(args, this.delete);
    try {
      const url = this.url(tableName, ["bulk"], { ids: ids } as any);
      const cfg = this.toRequest(ctx);
      log.debug(`DELETEing from ${url} and cfg ${JSON.stringify(cfg)}`);
      return await this.request({ url, method: "DELETE", ...cfg }, ctx);
    } catch (e: any) {
      throw this.parseError(e);
    }
  }

  override parseError<E extends BaseError>(err: Error, ...args: any[]): E {
    return HttpAdapter.parseError(err, ...args);
  }
}
