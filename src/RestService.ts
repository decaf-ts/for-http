import {
  BulkCrudOperator,
  Context,
  CrudOperator,
  findPrimaryKey,
  InternalError,
} from "@decaf-ts/db-decorators";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { Observable, Observer, Repository } from "@decaf-ts/core";
import { HttpAdapter } from "./adapter";
import { HttpFlags } from "./types";

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
 * @class
 */
export class RestService<
    M extends Model,
    Q,
    A extends HttpAdapter<any, any, Q, F, C>,
    F extends HttpFlags = HttpFlags,
    C extends Context<F> = Context<F>,
  >
  implements CrudOperator<M>, BulkCrudOperator<M>, Observable
{
  private readonly _class!: Constructor<M>;
  private _pk!: keyof M;

  /**
   * @description Gets the model class constructor
   * @summary Retrieves the model class constructor associated with this service.
   * Throws an error if no class definition is found.
   * @return {Constructor<M>} The model class constructor
   * @throws {InternalError} If no class definition is found
   */
  get class() {
    if (!this._class)
      throw new InternalError("No class definition found for this repository");
    return this._class;
  }

  /**
   * @description Gets the primary key property name
   * @summary Retrieves the name of the primary key property for the model.
   * If not already determined, it finds the primary key using the model class.
   * @return The primary key property name
   */
  get pk() {
    if (!this._pk) this._pk = findPrimaryKey(new this.class()).id;
    return this._pk;
  }

  protected observers: Observer[] = [];

  private readonly _adapter!: A;
  private _tableName!: string;

  /**
   * @description Gets the HTTP adapter
   * @summary Retrieves the HTTP adapter associated with this service.
   * Throws an error if no adapter is found.
   * @return {A} The HTTP adapter instance
   * @throws {InternalError} If no adapter is found
   */
  protected get adapter(): A {
    if (!this._adapter)
      throw new InternalError(
        "No adapter found for this repository. did you use the @uses decorator or pass it in the constructor?"
      );
    return this._adapter;
  }

  /**
   * @description Gets the table name for the model
   * @summary Retrieves the table name associated with the model class.
   * If not already determined, it gets the table name from the Repository utility.
   * @return {string} The table name
   */
  protected get tableName() {
    if (!this._tableName) this._tableName = Repository.table(this.class);
    return this._tableName;
  }

  /**
   * @description Initializes a new RestService instance
   * @summary Creates a new service instance with the specified adapter and optional model class.
   * The constructor stores the adapter and model class for later use in CRUD operations.
   * @param {A} adapter - The HTTP adapter instance to use for API requests
   * @param {Constructor<M>} [clazz] - Optional constructor for the model class
   */
  constructor(adapter: A, clazz?: Constructor<M>) {
    this._adapter = adapter;
    if (clazz) this._class = clazz;
  }

  /**
   * @description Creates a new resource
   * @summary Creates a new resource in the REST API using the provided model.
   * The method prepares the model for the adapter, sends the create request,
   * and then converts the response back to a model instance.
   * @param {M} model - The model instance to create
   * @param {...any[]} args - Additional arguments to pass to the adapter
   * @return {Promise<M>} A promise that resolves with the created model instance
   */
  async create(model: M, ...args: any[]): Promise<M> {
    // eslint-disable-next-line prefer-const
    let { record, id } = this.adapter.prepare(model, this.pk);
    record = await this.adapter.create(this.tableName, id, record, ...args);
    return this.adapter.revert(record, this.class, this.pk, id);
  }

  /**
   * @description Retrieves a resource by ID
   * @summary Fetches a resource from the REST API using the provided ID.
   * The method sends the read request and converts the response to a model instance.
   * @param {string|number} id - The identifier of the resource to retrieve
   * @param {...any[]} args - Additional arguments to pass to the adapter
   * @return {Promise<M>} A promise that resolves with the retrieved model instance
   */
  async read(id: string | number, ...args: any[]): Promise<M> {
    const m = await this.adapter.read(this.tableName, id, ...args);
    return this.adapter.revert(m, this.class, this.pk, id);
  }

  /**
   * @description Updates an existing resource
   * @summary Updates an existing resource in the REST API using the provided model.
   * The method prepares the model for the adapter, sends the update request,
   * and then converts the response back to a model instance.
   * @param {M} model - The model instance with updated data
   * @param {...any[]} args - Additional arguments to pass to the adapter
   * @return {Promise<M>} A promise that resolves with the updated model instance
   */
  async update(model: M, ...args: any[]): Promise<M> {
    // eslint-disable-next-line prefer-const
    let { record, id } = this.adapter.prepare(model, this.pk);
    record = await this.adapter.update(this.tableName, id, record, ...args);
    return this.adapter.revert(record, this.class, this.pk, id);
  }

  /**
   * @description Deletes a resource by ID
   * @summary Removes a resource from the REST API using the provided ID.
   * The method sends the delete request and converts the response to a model instance.
   * @param {string|number} id - The identifier of the resource to delete
   * @param {...any[]} args - Additional arguments to pass to the adapter
   * @return {Promise<M>} A promise that resolves with the deleted model instance
   */
  async delete(id: string | number, ...args: any[]): Promise<M> {
    const m = await this.adapter.delete(this.tableName, id, ...args);
    return this.adapter.revert(m, this.class, this.pk, id);
  }

  /**
   * @description Creates multiple resources
   * @summary Creates multiple resources in the REST API using the provided models.
   * The method prepares each model for the adapter, sends a bulk create request,
   * and then converts the responses back to model instances.
   * @param {M[]} models - The model instances to create
   * @param {...any[]} args - Additional arguments to pass to the adapter
   * @return {Promise<M[]>} A promise that resolves with an array of created model instances
   */
  async createAll(models: M[], ...args: any[]): Promise<M[]> {
    if (!models.length) return models;
    const prepared = models.map((m) => this.adapter.prepare(m, this.pk));
    const ids = prepared.map((p) => p.id);
    let records = prepared.map((p) => p.record);
    records = await this.adapter.createAll(
      this.tableName,
      ids as (string | number)[],
      records,
      ...args
    );
    return records.map((r, i) =>
      this.adapter.revert(r, this.class, this.pk, ids[i] as string | number)
    );
  }

  /**
   * @description Deletes multiple resources by IDs
   * @summary Removes multiple resources from the REST API using the provided IDs.
   * The method sends a bulk delete request and converts the responses to model instances.
   * @param {string[]|number[]} keys - The identifiers of the resources to delete
   * @param {...any[]} args - Additional arguments to pass to the adapter
   * @return {Promise<M[]>} A promise that resolves with an array of deleted model instances
   */
  async deleteAll(keys: string[] | number[], ...args: any[]): Promise<M[]> {
    const results = await this.adapter.deleteAll(this.tableName, keys, ...args);
    return results.map((r, i) =>
      this.adapter.revert(r, this.class, this.pk, keys[i])
    );
  }

  /**
   * @description Retrieves multiple resources by IDs
   * @summary Fetches multiple resources from the REST API using the provided IDs.
   * The method sends a bulk read request and converts the responses to model instances.
   * @param {string[]|number[]} keys - The identifiers of the resources to retrieve
   * @param {...any[]} args - Additional arguments to pass to the adapter
   * @return {Promise<M[]>} A promise that resolves with an array of retrieved model instances
   */
  async readAll(keys: string[] | number[], ...args: any[]): Promise<M[]> {
    const records = await this.adapter.readAll(this.tableName, keys, ...args);
    return records.map((r, i) =>
      this.adapter.revert(r, this.class, this.pk, keys[i])
    );
  }

  /**
   * @description Updates multiple resources
   * @summary Updates multiple resources in the REST API using the provided models.
   * The method prepares each model for the adapter, sends a bulk update request,
   * and then converts the responses back to model instances.
   * @param {M[]} models - The model instances with updated data
   * @param {...any[]} args - Additional arguments to pass to the adapter
   * @return {Promise<M[]>} A promise that resolves with an array of updated model instances
   */
  async updateAll(models: M[], ...args: any[]): Promise<M[]> {
    const records = models.map((m) => this.adapter.prepare(m, this.pk));
    const updated = await this.adapter.updateAll(
      this.tableName,
      records.map((r) => r.id),
      records.map((r) => r.record),
      ...args
    );
    return updated.map((u, i) =>
      this.adapter.revert(u, this.class, this.pk, records[i].id)
    );
  }

  /**
   * @description Registers an observer
   * @summary Adds an observer to the list of observers that will be notified of changes.
   * Throws an error if the observer is already registered.
   * @param {Observer} observer - The observer to register
   * @return {void}
   * @throws {InternalError} If the observer is already registered
   */
  observe(observer: Observer): void {
    const index = this.observers.indexOf(observer);
    if (index !== -1) throw new InternalError("Observer already registered");
    this.observers.push(observer);
  }

  /**
   * @description Unregisters an observer
   * @summary Removes an observer from the list of observers.
   * Throws an error if the observer is not found.
   * @param {Observer} observer - The observer to unregister
   * @return {void}
   * @throws {InternalError} If the observer is not found
   */
  unObserve(observer: Observer): void {
    const index = this.observers.indexOf(observer);
    if (index === -1) throw new InternalError("Failed to find Observer");
    this.observers.splice(index, 1);
  }

  /**
   * @description Notifies all registered observers
   * @summary Calls the refresh method on all registered observers to update themselves.
   * Any errors during observer refresh are logged as warnings but don't stop the process.
   * @param {...any[]} [args] - Optional arguments to pass to the observer refresh method
   * @return {Promise<void>} A promise that resolves when all observers have been updated
   */
  async updateObservers(...args: any[]): Promise<void> {
    const results = await Promise.allSettled(
      this.observers.map((o) => o.refresh(...args))
    );
    results.forEach((result, i) => {
      if (result.status === "rejected")
        console.warn(
          `Failed to update observable ${this.observers[i]}: ${result.reason}`
        );
    });
  }
}
