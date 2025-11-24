import {
  BulkCrudOperator,
  Context,
  CrudOperator,
  InternalError,
  OperationKeys,
  PrimaryKeyType,
} from "@decaf-ts/db-decorators";
import { model, Model } from "@decaf-ts/decorator-validation";
import { Constructor } from "@decaf-ts/decoration";
import {
  ContextOf,
  ContextualArgs,
  ContextualLoggedClass,
  MaybeContextualArg,
  Observable,
  Observer,
} from "@decaf-ts/core";
import { HttpAdapter } from "./adapter";
import { Logger } from "@decaf-ts/logging";
import { RestRepository } from "./RestRepository";

/**
 * @description Service class for REST API operations
 * @summary Provides a comprehensive implementation for interacting with REST APIs.
 * This class implements CRUD operations for single and bulk operations, as well as
 * the Observable pattern to notify observers of changes. It works with HTTP adapters
 * to perform the actual API requests and handles model conversion.
 * @template M - The model type, extending Model
 * @template Q - The query type used by the adapter
 * @template A - The HTTP adapter type, extending HttpAdapter
 * @template F - The HTTP flags type, extending HttpFlags
 * @template C - The context type, extending Context<F>
 * @param {A} adapter - The HTTP adapter instance
 * @param {Constructor<M>} [clazz] - Optional constructor for the model class
 * @class RestService
 * @example
 * ```typescript
 * // Create a service for User model with Axios adapter
 * const axiosAdapter = new AxiosAdapter({
 *   protocol: 'https',
 *   host: 'api.example.com'
 * });
 * const userService = new RestService(axiosAdapter, User);
 *
 * // Create a new user
 * const user = new User({ name: 'John Doe', email: 'john@example.com' });
 * const createdUser = await userService.create(user);
 *
 * // Update a user
 * createdUser.name = 'Jane Doe';
 * const updatedUser = await userService.update(createdUser);
 *
 * // Delete a user
 * await userService.delete(updatedUser.id);
 * ```
 * @mermaid
 * sequenceDiagram
 *   participant Client
 *   participant Service as RestService
 *   participant Adapter as HttpAdapter
 *   participant API
 *   Client->>Service: create(model)
 *   Service->>Adapter: prepare(model, pk)
 *   Service->>Adapter: create(table, id, record)
 *   Adapter->>API: HTTP POST
 *   API-->>Adapter: 201 Created
 *   Adapter-->>Service: record
 *   Service-->>Client: revert(record)
 */
export class RestService<
  M extends Model,
  A extends HttpAdapter<any, any, any, any>,
  Q = A extends HttpAdapter<any, any, infer Q, any> ? Q : never,
> extends RestRepository<M, A, Q> {
  /**
   * @description Initializes a new RestService instance
   * @summary Creates a new service instance with the specified adapter and optional model class.
   * The constructor stores the adapter and model class for later use in CRUD operations.
   * @param {A} adapter - The HTTP adapter instance to use for API requests
   * @param {Constructor<M>} [clazz] - Optional constructor for the model class
   */
  constructor(adapter: A, clazz?: Constructor<M>) {
    super(adapter, clazz);
  }

  protected override async createPrefix(
    model: M,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<[M, ...any[], ContextOf<A>]> {
    return super.createPrefix(model, ...args);
  }

  protected override async createAllPrefix(
    models: M[],
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<[M[], ...any[], ContextOf<A>]> {
    return super.createAllPrefix(models, ...args);
  }

  protected override async readPrefix(
    key: PrimaryKeyType,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<[PrimaryKeyType, ...any[], ContextOf<A>]> {
    return super.readPrefix(key, ...args);
  }

  protected override async readAllPrefix(
    keys: PrimaryKeyType[],
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<[PrimaryKeyType[], ...any[], ContextOf<A>]> {
    return super.readAllPrefix(keys, ...args);
  }

  protected override async updatePrefix(
    model: M,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<[M, ...any[], ContextOf<A>]> {
    return super.updatePrefix(model, ...args);
  }

  protected override async updateAllPrefix(
    models: M[],
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<[M[], ...any[], ContextOf<A>]> {
    return super.updateAllPrefix(models, ...args);
  }

  protected override async deletePrefix(
    key: PrimaryKeyType,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<[PrimaryKeyType, ...any[], ContextOf<A>]> {
    const contextArgs = await Context.args<M, ContextOf<A>>(
      OperationKeys.DELETE,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const model = await this.read(key, ...contextArgs.args);
    await enforceDBDecorators<M, Repository<M, A>, any>(
      this,
      contextArgs.context,
      model,
      OperationKeys.DELETE,
      OperationKeys.ON
    );
    return [key, ...contextArgs.args];
  }

  protected override async deleteAllPrefix(
    keys: PrimaryKeyType[],
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<[PrimaryKeyType[], ...any[], ContextOf<A>]> {
    const contextArgs = await Context.args<M, ContextOf<A>>(
      OperationKeys.DELETE,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    return [keys, ...contextArgs.args];
  }

  override toString(): string {
    return `${this.class.name} rest service`;
  }
}
