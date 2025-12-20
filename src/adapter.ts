import {
  Adapter,
  AuthorizationError,
  Condition,
  ConnectionError,
  Paginator,
  Context,
  ContextualArgs,
  FlagsOf,
  ForbiddenError,
  MaybeContextualArg,
  MigrationError,
  ObserverError,
  PagingError,
  PersistenceKeys,
  PreparedModel,
  QueryError,
  Repository,
  PreparedStatement,
  UnsupportedError,
} from "@decaf-ts/core";
import {
  BadRequestError,
  BaseError,
  ConflictError,
  InternalError,
  NotFoundError,
  OperationKeys,
  PrimaryKeyType,
  SerializationError,
  ValidationError,
} from "@decaf-ts/db-decorators";
import { HttpConfig, HttpFlags } from "./types";
import { Model } from "@decaf-ts/decorator-validation";
import {
  apply,
  Constructor,
  Decoration,
  methodMetadata,
  Metadata,
} from "@decaf-ts/decoration";
import { RestService } from "./RestService";
import {
  prepared,
  QueryOptions,
  Statement,
  SequenceOptions,
  Sequence,
} from "@decaf-ts/core";
import { toKebabCase } from "@decaf-ts/logging";
import { HttpStatement } from "./HttpStatement";
import { HttpPaginator } from "./HttpPaginator";
import type { AdapterFlags } from "@decaf-ts/core";
import { ResponseParser } from "./ResponseParser";

export function suffixMethod(
  obj: any,
  before: (...args: any[]) => any,
  suffix: (...args: any[]) => any,
  beforeName?: string
) {
  const name = beforeName ? beforeName : before.name;
  obj[name] = new Proxy(obj[name], {
    apply: async (target, thisArg, argArray) => {
      let results = target.call(thisArg, ...argArray);
      if (results instanceof Promise) results = await results;

      results = suffix.call(thisArg, results);

      if (results instanceof Promise) results = await results;

      return results;
    },
  });
}
/**
 * @description Abstract HTTP adapter for REST API interactions
 * @summary Provides a base implementation for HTTP adapters with methods for CRUD operations,
 * URL construction, and error handling. This class extends the core Adapter class and
 * implements the necessary methods for HTTP communication. Concrete implementations
 * must provide specific HTTP client functionality.
 * @template Y - The native HTTP client type
 * @template Q - The query type used by the adapter
 * @template F - The HTTP flags type, extending HttpFlags
 * @template C - The context type, extending Context<F>
 * @param {Y} native - The native HTTP client instance
 * @param {HttpConfig} config - Configuration for the HTTP adapter
 * @param {string} flavour - The adapter flavor identifier
 * @param {string} [alias] - Optional alias for the adapter
 * @class HttpAdapter
 * @example
 * ```typescript
 * // Example implementation with Axios
 * class AxiosAdapter extends HttpAdapter<AxiosInstance, AxiosRequestConfig> {
 *   constructor(config: HttpConfig) {
 *     super(axios.create(), config, 'axios');
 *   }
 *
 *   async request<V>(details: AxiosRequestConfig): Promise<V> {
 *     const response = await this.native.request(details);
 *     return response.data;
 *   }
 *
 *   // Implement other abstract methods...
 * }
 * ```
 */
export abstract class HttpAdapter<
  CONF extends HttpConfig,
  CON,
  REQ,
  Q extends PreparedStatement<any> = PreparedStatement<any>,
  C extends Context<HttpFlags> = Context<HttpFlags>,
> extends Adapter<CONF, CON, Q, C> {
  protected constructor(config: CONF, flavour: string, alias?: string) {
    super(
      Object.assign({}, config, {
        responseParser: config.responseParser || new ResponseParser(),
      }),
      flavour,
      alias
    );

    [
      this.create,
      this.read,
      this.update,
      this.delete,
      this.createAll,
      this.readAll,
      this.updateAll,
      this.deleteAll,
    ].forEach((method) => {
      suffixMethod(
        this,
        method,
        (res: any) => this.parseResponse(method.name, res),
        method.name
      );
    });
  }

  /**
   * @description Generates operation flags with HTTP headers
   * @summary Extends the base flags method to ensure HTTP headers exist on the flags payload.
   * @template M - The model type
   * @param {OperationKeys|string} operation - The type of operation being performed
   * @param {Constructor | Constructor[]} model - The target model constructor(s)
   * @param {Partial<FlagsOf<C>>} overrides - Optional flag overrides
   * @param {...any[]} args - Additional arguments forwarded to the base implementation
   * @return {Promise<FlagsOf<C>>} The flags object with headers
   */
  protected override async flags<M extends Model>(
    operation: OperationKeys | string,
    model: Constructor<M> | Constructor<M>[],
    overrides: Partial<FlagsOf<C>>,
    ...args: any[]
  ): Promise<FlagsOf<C>> {
    const flags = await super.flags(operation, model, overrides, ...args);
    return Object.assign({}, flags, {
      headers: flags.headers ?? {},
    });
  }

  /**
   * @description Returns the repository constructor for this adapter
   * @summary Provides the RestService class as the repository implementation for this HTTP adapter.
   * This method is used to create repository instances that work with this adapter type.
   * @template R - Repository subtype working with this adapter
   * @return {Constructor<R>} The repository constructor
   */
  override repository<
    R extends Repository<any, Adapter<CONF, CON, Q, C>>,
  >(): Constructor<R> {
    return RestService as unknown as Constructor<R>;
  }

  /**
   * @description Prepares a model for persistence
   * @summary Converts a model instance into a format suitable for database storage,
   * handling column mapping and separating transient properties
   * @template M - The model type
   * @param {M} model - The model instance to prepare
   * @param pk - The primary key property name
   * @param args
   * @return The prepared data
   */
  override prepare<M extends Model>(
    model: M,
    ...args: ContextualArgs<C>
  ): PreparedModel {
    const { log } = this.logCtx(args, this.prepare);
    const result = Object.assign({}, model);
    if ((model as any)[PersistenceKeys.METADATA]) {
      log.silly(
        `Passing along persistence metadata for ${(model as any)[PersistenceKeys.METADATA]}`
      );
      Object.defineProperty(result, PersistenceKeys.METADATA, {
        enumerable: false,
        writable: false,
        configurable: true,
        value: (model as any)[PersistenceKeys.METADATA],
      });
    }

    return {
      record: model,
      id: model[Model.pk(model.constructor as Constructor<M>)] as string,
    };
  }

  /**
   * @description Converts database data back into a model instance
   * @summary Reconstructs a model instance from database data, handling column mapping
   * and reattaching transient properties
   * @template M - The model type
   * @param obj - The database record
   * @param {string|Constructor<M>} clazz - The model class or name
   * @param pk - The primary key property name
   * @param {string|number|bigint} id - The primary key value
   * @return {M} The reconstructed model instance
   */
  override revert<M extends Model>(
    obj: Record<string, any>,
    clazz: string | Constructor<M>,
    id: PrimaryKeyType,
    ...args: ContextualArgs<C>
  ): M {
    const { log } = this.logCtx(args, this.revert);
    const ob: Record<string, any> = {};
    const m = (
      typeof clazz === "string" ? Model.build(ob, clazz) : new clazz(ob)
    ) as M;
    log.silly(`Rebuilding model ${m.constructor.name} id ${id}`);
    const constr = typeof clazz === "string" ? Model.get(clazz) : clazz;
    if (!constr)
      throw new InternalError(
        `Failed to retrieve model constructor for ${clazz}`
      );
    const result = new (constr as Constructor<M>)(obj);
    const metadata = obj[PersistenceKeys.METADATA];
    if (metadata) {
      log.silly(
        `Passing along ${this.flavour} persistence metadata for ${m.constructor.name} id ${id}: ${metadata}`
      );
      Object.defineProperty(result, PersistenceKeys.METADATA, {
        enumerable: false,
        configurable: false,
        writable: false,
        value: metadata,
      });
    }

    return result;
  }

  protected toTableName<M extends Model>(t: string | Constructor<M>) {
    return typeof t === "string" ? t : toKebabCase(Model.tableName(t));
  }

  /**
   * @description Constructs a URL for API requests
   * @summary Builds a complete URL for API requests using the configured protocol and host,
   * the specified table name, and optional query parameters. The method handles URL encoding.
   * @param {string | Constructor} tableName - The name of the table or endpoint
   * @return {string} The encoded URL string
   */
  url<M extends Model>(tableName: string | Constructor<M>): string;
  /**
   * @description Constructs a URL for API requests
   * @summary Builds a complete URL for API requests using the configured protocol and host,
   * the specified table name, and optional query parameters. The method handles URL encoding.
   * @param {string | Constructor} tableName - The name of the table or endpoint
   * @param {string[]} pathParams - Optional query parameters
   * @return {string} The encoded URL string
   */
  url<M extends Model>(
    tableName: string | Constructor<M>,
    pathParams: string[]
  ): string;
  /**
   * @description Constructs a URL for API requests
   * @summary Builds a complete URL for API requests using the configured protocol and host,
   * the specified table name, and optional query parameters. The method handles URL encoding.
   * @param {string | Constructor} tableName - The name of the table or endpoint
   * @param {Record<string, string | number>} queryParams - Optional query parameters
   * @return {string} The encoded URL string
   */
  url<M extends Model>(
    tableName: string | Constructor<M>,
    queryParams: Record<string, string | number>
  ): string;
  url<M extends Model>(
    tableName: string | Constructor<M>,
    pathParams: string[],
    queryParams: Record<string, string | number>
  ): string;
  /**
   * @description Constructs a URL for API requests
   * @summary Builds a complete URL for API requests using the configured protocol and host,
   * the specified table name, and optional query parameters. The method handles URL encoding.
   * @param {string | Constructor} tableName - The name of the table or endpoint
   * @param {string[]} [pathParams] - Optional query parameters
   * @param {Record<string, string | number>} [queryParams] - Optional query parameters
   * @return {string} The encoded URL string
   */
  url<M extends Model>(
    tableName: string | Constructor<M>,
    pathParams?: string[] | Record<string, string | number>,
    queryParams?: Record<string, string | number>
  ): string {
    if (!queryParams) {
      if (pathParams && !Array.isArray(pathParams)) {
        queryParams = pathParams;
        pathParams = [];
      }
    }

    tableName = this.toTableName(tableName);
    const url = new URL(
      `${this.config.protocol}://${this.config.host}/${tableName}${pathParams && pathParams.length ? `/${(pathParams as string[]).join("/")}` : ""}`
    );
    if (queryParams)
      Object.entries(queryParams).forEach(([key, value]) =>
        url.searchParams.append(
          key,
          Array.isArray(value) ? value.join(",") : value.toString()
        )
      );

    return encodeURI(url.toString());
  }

  abstract toRequest(query: Q): REQ;
  abstract toRequest(ctx: C): REQ;
  abstract toRequest(query: Q, ctx: C): REQ;
  abstract toRequest(ctxOrQuery: C | Q, ctx?: C): REQ;

  /**
   * @description Sends an HTTP request
   * @summary Abstract method that must be implemented by subclasses to send HTTP requests
   * using the native HTTP client. This is the core method for making API calls.
   * @template V - The response value type
   * @param {REQ} details - The request details specific to the HTTP client
   * @return {Promise<V>} A promise that resolves with the response data
   */
  abstract request<V>(details: REQ, ...args: MaybeContextualArg<C>): Promise<V>;

  protected extractIdArgs<M extends Model>(
    model: Constructor<M> | string,
    id: PrimaryKeyType
  ): string[] {
    const idStr = id.toString();
    if (typeof model === "string") return [idStr];
    const composed = Model.composed(model, Model.pk(model));
    if (!composed) return [idStr];
    return idStr.split(composed.separator);
  }

  parseResponse(method: OperationKeys | string, res: any) {
    if (!this.config.responseParser)
      throw new InternalError(`No response parser configured`);
    return this.config.responseParser.parse(method, res);
  }

  /**
   * @description Creates a new resource
   * @summary Abstract method that must be implemented by subclasses to create a new resource
   * via HTTP. This typically corresponds to a POST request.
   * @param {string} tableName - The name of the table or endpoint
   * @param {string|number} id - The identifier for the resource
   * @param {Record<string, any>} model - The data model to create
   * @param {...any[]} args - Additional arguments
   * @return {Promise<Record<string, any>>} A promise that resolves with the created resource
   */
  abstract override create<M extends Model>(
    tableName: Constructor<M> | string,
    id: PrimaryKeyType,
    model: Record<string, any>,
    ...args: ContextualArgs<C>
  ): Promise<Record<string, any>>;

  /**
   * @description Retrieves a resource by ID
   * @summary Abstract method that must be implemented by subclasses to retrieve a resource
   * via HTTP. This typically corresponds to a GET request.
   * @param {string} tableName - The name of the table or endpoint
   * @param {string|number|bigint} id - The identifier for the resource
   * @param {...any[]} args - Additional arguments
   * @return {Promise<Record<string, any>>} A promise that resolves with the retrieved resource
   */
  abstract override read<M extends Model>(
    tableName: Constructor<M> | string,
    id: PrimaryKeyType,
    ...args: ContextualArgs<C>
  ): Promise<Record<string, any>>;

  /**
   * @description Updates an existing resource
   * @summary Abstract method that must be implemented by subclasses to update a resource
   * via HTTP. This typically corresponds to a PUT or PATCH request.
   * @param {string} tableName - The name of the table or endpoint
   * @param {string|number} id - The identifier for the resource
   * @param {Record<string, any>} model - The updated data model
   * @param {...any[]} args - Additional arguments
   * @return {Promise<Record<string, any>>} A promise that resolves with the updated resource
   */
  abstract override update<M extends Model>(
    tableName: Constructor<M> | string,
    id: string | number,
    model: Record<string, any>,
    ...args: ContextualArgs<C>
  ): Promise<Record<string, any>>;

  /**
   * @description Deletes a resource by ID
   * @summary Abstract method that must be implemented by subclasses to delete a resource
   * via HTTP. This typically corresponds to a DELETE request.
   * @param {string} tableName - The name of the table or endpoint
   * @param {string|number|bigint} id - The identifier for the resource to delete
   * @param {...any[]} args - Additional arguments
   * @return {Promise<Record<string, any>>} A promise that resolves with the deletion result
   */
  abstract override delete<M extends Model>(
    tableName: Constructor<M> | string,
    id: PrimaryKeyType,
    ...args: ContextualArgs<C>
  ): Promise<Record<string, any>>;

  /**
   * @description Executes a raw query
   * @summary Method for executing raw queries directly with the HTTP client.
   * This method is not supported by default in HTTP adapters and throws an UnsupportedError.
   * Subclasses can override this method to provide implementation.
   * @template R - The result type
   * @param {Q} rawInput - The raw query input
   * @param {boolean} process - Whether to process the result
   * @param {...any[]} args - Additional arguments
   * @return {Promise<R>} A promise that resolves with the query result
   * @throws {UnsupportedError} Always throws as this method is not supported by default
   */
  raw<R>(rawInput: Q, ...args: ContextualArgs<C>): Promise<R> {
    const { ctxArgs, ctx } = this.logCtx(args, this.raw);
    const req = this.toRequest(rawInput, ctx);
    return this.request(req, ...ctxArgs);
  }

  /**
   * @description Creates a sequence
   * @summary Method for creating a sequence for generating unique identifiers.
   * This method is not supported by default in HTTP adapters and throws an UnsupportedError.
   * Subclasses can override this method to provide implementation.
   * @param {SequenceOptions} options - Options for creating the sequence
   * @return {Promise<Sequence>} A promise that resolves with the created sequence
   * @throws {UnsupportedError} Always throws as this method is not supported by default
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override Sequence(options: SequenceOptions): Promise<Sequence> {
    return Promise.reject(
      new UnsupportedError(
        "Api is not natively available for HttpAdapters. If required, please extends this class"
      )
    );
  }

  /**
   * @description Creates a statement for querying
   * @summary Method for creating a statement for building and executing queries.
   * This method is not supported by default in HTTP adapters and throws an UnsupportedError.
   * Subclasses can override this method to provide implementation.
   * @template M - The model type
   * @template ! - The raw query type
   * @return {Statement<Q, M, any>} A statement object for building queries
   * @throws {UnsupportedError} Always throws as this method is not supported by default
   */
  override Statement<M extends Model>(
    overrides?: Partial<AdapterFlags>
  ): Statement<M, Adapter<CONF, CON, Q, C>, any> {
    return new HttpStatement(this, overrides);
  }

  override Paginator<M extends Model>(
    query: Q,
    size: number,
    clazz: Constructor<M>
  ): Paginator<M, M, Q> {
    return new HttpPaginator<M, Q, HttpAdapter<CONF, CON, REQ, Q, C>>(
      this,
      query,
      size,
      clazz
    );
  }

  /**
   * @description Parses a condition into a query
   * @summary Method for parsing a condition object into a query format understood by the HTTP client.
   * This method is not supported by default in HTTP adapters and throws an UnsupportedError.
   * Subclasses can override this method to provide implementation.
   * @param {Condition<any>} condition - The condition to parse
   * @return {Q} The parsed query
   * @throws {UnsupportedError} Always throws as this method is not supported by default
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  parseCondition(condition: Condition<any>): Q {
    throw new UnsupportedError(
      "Api is not natively available for HttpAdapters. If required, please extends this class"
    );
  }

  static parseError<E extends BaseError>(
    err: Error | string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: any[]
  ): E {
    const msg = typeof err === "string" ? err : err.message;
    if (msg.includes(NotFoundError.name) || msg.includes("404"))
      return new NotFoundError(err) as E;
    if (msg.includes(ConflictError.name) || msg.includes("409"))
      return new ConflictError(err) as E;
    if (msg.includes(BadRequestError.name) || msg.includes("400"))
      return new BadRequestError(err) as E;
    if (msg.includes(ValidationError.name) || msg.includes("422"))
      return new ValidationError(err) as E;
    if (msg.includes(QueryError.name)) return new QueryError(err) as E;
    if (msg.includes(PagingError.name)) return new PagingError(err) as E;
    if (msg.includes(UnsupportedError.name))
      return new UnsupportedError(err) as E;
    if (msg.includes(MigrationError.name)) return new MigrationError(err) as E;
    if (msg.includes(ObserverError.name)) return new ObserverError(err) as E;
    if (msg.includes(AuthorizationError.name))
      return new AuthorizationError(err) as E;
    if (msg.includes(ForbiddenError.name)) return new ForbiddenError(err) as E;
    if (msg.includes(ConnectionError.name))
      return new ConnectionError(err) as E;
    if (msg.includes(SerializationError.name))
      return new SerializationError(err) as E;
    return new InternalError(err) as E;
  }

  static override decoration() {
    super.decoration();
    function query(options: QueryOptions) {
      return function query(obj: object, prop?: any, descriptor?: any) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        function innerQuery(options: QueryOptions) {
          return function innerQuery(
            obj: any,
            propertyKey?: any,
            descriptor?: any
          ) {
            (descriptor as TypedPropertyDescriptor<any>).value = new Proxy(
              (descriptor as TypedPropertyDescriptor<any>).value,
              {
                async apply(
                  target: any,
                  thisArg: any,
                  args: any[]
                ): Promise<any> {
                  const repo = thisArg as Repository<any, any>;

                  const contextArgs = await Context.args<any, any>(
                    propertyKey,
                    repo.class,
                    args,
                    repo["adapter"],
                    repo["_overrides"] || {}
                  );
                  const { log, ctxArgs } = repo["logCtx"](
                    contextArgs.args,
                    target
                  );
                  log.verbose(`Running prepared statement ${target.name}`);
                  log.debug(`With args: ${JSON.stringify(args, null, 2)}`);
                  return (thisArg as Repository<any, any>).statement(
                    target.name,
                    ...ctxArgs
                  );
                },
              }
            );
          };
        }

        return apply(
          methodMetadata(Metadata.key(PersistenceKeys.QUERY, prop), options),
          prepared(),
          innerQuery(options)
        )(obj, prop, descriptor);
      };
    }

    Decoration.for(PersistenceKeys.QUERY)
      .define({
        decorator: query,
      } as any)
      .apply();
  }
}

HttpAdapter.decoration();
