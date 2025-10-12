import { HttpAdapter } from "../adapter";
import { Axios, AxiosRequestConfig } from "axios";
import { HttpConfig } from "../types";
import { AxiosFlags } from "./types";
import {
  BaseError,
  ConflictError,
  Context,
  InternalError,
  NotFoundError,
} from "@decaf-ts/db-decorators";
import { AxiosFlavour } from "./constants";
import { AuthorizationError, UnsupportedError } from "@decaf-ts/core";

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
  AxiosFlags,
  Context<AxiosFlags>
> {
  constructor(config: HttpConfig, alias?: string) {
    super(config, AxiosFlavour, alias);
  }

  protected override getClient(): Axios {
    return new Axios();
  }

  /**
   * @description Sends an HTTP request using Axios
   * @summary Implementation of the abstract request method from HttpAdapter.
   * This method uses the Axios instance to send HTTP requests with the provided configuration.
   * @template V - The response value type
   * @param {AxiosRequestConfig} details - The Axios request configuration
   * @return {Promise<V>} A promise that resolves with the response data
   */
  override async request<V>(details: AxiosRequestConfig): Promise<V> {
    return this.client.request(details);
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
  async create(
    tableName: string,
    id: string | number,
    model: Record<string, any>
  ): Promise<Record<string, any>> {
    try {
      const url = this.url(tableName);
      return this.client.post(url, model);
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
  async read(
    tableName: string,
    id: string | number | bigint
  ): Promise<Record<string, any>> {
    try {
      const url = this.url(tableName, { id: id as string | number });
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
  async update(
    tableName: string,
    id: string | number,
    model: Record<string, any>
  ): Promise<Record<string, any>> {
    try {
      const url = this.url(tableName);
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
  async delete(
    tableName: string,
    id: string | number | bigint
  ): Promise<Record<string, any>> {
    try {
      const url = this.url(tableName, { id: id as string | number });
      return this.client.delete(url);
    } catch (e: any) {
      throw this.parseError(e);
    }
  }

  override parseError(err: Error): BaseError {
    const errs = [
      InternalError,
      AuthorizationError,
      ConflictError,
      NotFoundError,
      UnsupportedError,
    ];
    for (const error of errs) {
      if ((err as Error).message.includes(error.name))
        return new error(err.message);
    }
    return new InternalError(err.message);
  }
}
