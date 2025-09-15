import { Repository } from "@decaf-ts/core";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { HttpAdapter } from "./adapter";
import { Context } from "@decaf-ts/db-decorators";
import { HttpFlags } from "./types";

/**
 * @description Repository for REST API interactions
 * @summary A specialized repository implementation for interacting with REST APIs.
 * This class extends the core Repository class and works with HTTP adapters to
 * provide CRUD operations for models via REST endpoints.
 * This Is NOT the default repository for the HTTP adapter. That would be {@link RestService}.
 * Use this only in the specific case of needing to run the CURD model logic (decoration) before submitting to the backend
 * @template M - The model type, extending Model
 * @template Q - The query type used by the adapter
 * @template A - The HTTP adapter type, extending HttpAdapter
 * @template F - The HTTP flags type, extending HttpFlags
 * @template C - The context type, extending Context<F>
 * @param {A} adapter - The HTTP adapter instance
 * @param {Constructor<M>} [clazz] - Optional constructor for the model class
 * @example
 * ```typescript
 * // Create a repository for User model with Axios adapter
 * const axiosAdapter = new AxiosAdapter({
 *   protocol: 'https',
 *   host: 'api.example.com'
 * });
 * const userRepository = new RestRepository(axiosAdapter, User);
 *
 * // Use the repository for CRUD operations
 * const user = await userRepository.findById('123');
 * ```
 * @class RestRepository
 * @see {@link RestService}
 */
export class RestRepository<
  M extends Model,
  Q,
  A extends HttpAdapter<any, any, Q, F, C>,
  F extends HttpFlags = HttpFlags,
  C extends Context<F> = Context<F>,
> extends Repository<M, Q, A> {
  constructor(adapter: A, clazz?: Constructor<M>) {
    super(adapter, clazz);
  }
}
