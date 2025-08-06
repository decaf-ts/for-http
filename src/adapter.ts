import {
  Adapter,
  Condition,
  Repository,
  Sequence,
  SequenceOptions,
  UnsupportedError,
} from "@decaf-ts/core";
import { BaseError, Context, OperationKeys } from "@decaf-ts/db-decorators";
import { HttpConfig, HttpFlags } from "./types";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { RestService } from "./RestService";
import { Statement } from "@decaf-ts/core";

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
 * @class
 */
export abstract class HttpAdapter<
  Y,
  Q,
  F extends HttpFlags = HttpFlags,
  C extends Context<F> = Context<F>,
> extends Adapter<Y, Q, F, C> {
  protected constructor(
    native: Y,
    protected config: HttpConfig,
    flavour: string,
    alias?: string
  ) {
    super(native, flavour, alias);
  }

  /**
   * @description Generates operation flags with HTTP headers
   * @summary Extends the base flags method to include HTTP-specific headers for operations.
   * This method adds an empty headers object to the flags returned by the parent class.
   * @template F - The Repository Flags type
   * @template M - The model type
   * @param {OperationKeys.CREATE|OperationKeys.READ|OperationKeys.UPDATE|OperationKeys.DELETE} operation - The operation type
   * @param {Constructor<M>} model - The model constructor
   * @param {Partial<F>} overrides - Optional flag overrides
   * @return {F} The flags object with headers
   */
  override flags<M extends Model>(
    operation:
      | OperationKeys.CREATE
      | OperationKeys.READ
      | OperationKeys.UPDATE
      | OperationKeys.DELETE,
    model: Constructor<M>,
    overrides: Partial<F>
  ) {
    return Object.assign(super.flags<M>(operation, model, overrides), {
      headers: {},
    });
  }

  /**
   * @description Returns the repository constructor for this adapter
   * @summary Provides the RestService class as the repository implementation for this HTTP adapter.
   * This method is used to create repository instances that work with this adapter type.
   * @template M - The model type
   * @return {Constructor<Repository<M, Q, HttpAdapter<Y, Q, F, C>, F, C>>} The repository constructor
   */
  override repository<M extends Model>(): Constructor<
    Repository<M, Q, HttpAdapter<Y, Q, F, C>, F, C>
  > {
    return RestService as unknown as Constructor<
      Repository<M, Q, HttpAdapter<Y, Q, F, C>, F, C>
    >;
  }

  /**
   * @description Constructs a URL for API requests
   * @summary Builds a complete URL for API requests using the configured protocol and host,
   * the specified table name, and optional query parameters. The method handles URL encoding.
   * @param {string} tableName - The name of the table or endpoint
   * @param {Record<string, string | number>} [queryParams] - Optional query parameters
   * @return {string} The encoded URL string
   */
  protected url(
    tableName: string,
    queryParams?: Record<string, string | number>
  ) {
    const url = new URL(
      `${this.config.protocol}://${this.config.host}/${tableName}`
    );
    if (queryParams)
      Object.entries(queryParams).forEach(([key, value]) =>
        url.searchParams.append(key, value.toString())
      );

    return encodeURI(url.toString());
  }

  /**
   * @description Parses and converts errors to BaseError type
   * @summary Processes errors that occur during HTTP operations and converts them to
   * the appropriate BaseError type. Currently returns the error as-is, but can be
   * extended to handle specific error messages differently.
   * @param {Error} err - The error to parse
   * @return {BaseError} The parsed error as a BaseError
   */
  parseError(err: Error): BaseError {
    const { message } = err;
    switch (message) {
      default:
        return err as BaseError;
    }
  }

  /**
   * @description Initializes the HTTP adapter
   * @summary Placeholder method for adapter initialization. This method is currently
   * a no-op but can be overridden by subclasses to perform initialization tasks.
   * @param {...any[]} args - Initialization arguments
   * @return {Promise<void>} A promise that resolves when initialization is complete
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async initialize(...args: any[]): Promise<void> {
    // do nothing
  }

  /**
   * @description Sends an HTTP request
   * @summary Abstract method that must be implemented by subclasses to send HTTP requests
   * using the native HTTP client. This is the core method for making API calls.
   * @template V - The response value type
   * @param {Q} details - The request details specific to the HTTP client
   * @return {Promise<V>} A promise that resolves with the response data
   */
  abstract request<V>(details: Q): Promise<V>;

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
  abstract override create(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    ...args: any[]
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
  abstract override read(
    tableName: string,
    id: string | number | bigint,
    ...args: any[]
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
  abstract override update(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    ...args: any[]
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
  abstract override delete(
    tableName: string,
    id: string | number | bigint,
    ...args: any[]
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  raw<R>(rawInput: Q, process: boolean, ...args: any[]): Promise<R> {
    throw new UnsupportedError(
      "Api is not natively available for HttpAdapters. If required, please extends this class"
    );
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
  Sequence(options: SequenceOptions): Promise<Sequence> {
    throw new UnsupportedError(
      "Api is not natively available for HttpAdapters. If required, please extends this class"
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
  override Statement<M extends Model>(): Statement<Q, M, any> {
    throw new UnsupportedError(
      "Api is not natively available for HttpAdapters. If required, please extends this class"
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
}
