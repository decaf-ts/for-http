import { Repository, Adapter } from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { Constructor } from "@decaf-ts/decoration";
import { HttpAdapter } from "./adapter";

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
 * @class RestRepository
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
 * @see {@link RestService}
 */
export class RestRepository<
  M extends Model,
  A extends HttpAdapter<any, any, any>,
  Q = A extends HttpAdapter<any, any, infer Q> ? Q : never,
> extends Repository<M, A> {
  constructor(adapter: A, clazz?: Constructor<M>) {
    super(adapter, clazz);
  }

  url(path: string, queryParams?: Record<string, string | number>) {
    return this.adapter.url(path, queryParams);
  }

  async request<V>(details: Q) {
    return this.adapter.request<V>(details);
  }
}
