import {
  Context,
  DirectionLimitOffset,
  OrderDirection,
  PersistenceKeys,
  prepared,
  PreparedStatement,
  PreparedStatementKeys,
  Repository,
} from "@decaf-ts/core";
import type {
  ContextOf,
  MaybeContextualArg,
  SerializedPage,
} from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { Constructor } from "@decaf-ts/decoration";
import { HttpAdapter } from "./adapter";
import { OperationKeys } from "@decaf-ts/db-decorators";

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
  A extends HttpAdapter<any, any, any, any, any>,
  Q = A extends HttpAdapter<any, any, any, infer Q, any> ? Q : never,
> extends Repository<M, A> {
  protected override _overrides = Object.assign({}, super["_overrides"], {
    allowRawStatements: false,
    forcePrepareSimpleQueries: true,
    forcePrepareComplexQueries: true,
  });

  constructor(adapter: A, clazz?: Constructor<M>) {
    super(adapter, clazz);
  }

  url<M extends Model>(tableName: string | Constructor<M>): string;
  url<M extends Model>(
    tableName: string | Constructor<M>,
    pathParams: string[]
  ): string;
  url<M extends Model>(
    tableName: string | Constructor<M>,
    queryParams: Record<string, string | number> | undefined
  ): string;
  url<M extends Model>(
    tableName: string | Constructor<M>,
    pathParams?: string[] | Record<string, string | number>,
    queryParams?: Record<string, string | number>
  ): string {
    return this.adapter.url(tableName, pathParams as any, queryParams as any);
  }

  override async paginateBy(
    key: keyof M,
    order: OrderDirection,
    ref: Omit<DirectionLimitOffset, "direction"> = {
      offset: 1,
      limit: 10,
    },
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<SerializedPage<M>> {
    const { offset, bookmark, limit } = ref;
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.PAGE_BY, true)
    ).for(this.paginateBy);
    log.verbose(
      `paginating ${Model.tableName(this.class)} with page size ${limit}`
    );

    const params: DirectionLimitOffset = {
      direction: order,
      limit: limit,
    };
    if (bookmark) {
      params.bookmark = bookmark as any;
    }
    return this.statement(
      this.paginateBy.name,
      key,
      offset,
      params,
      ...ctxArgs
    );
  }

  override async listBy(
    key: keyof M,
    order: OrderDirection,
    ...args: MaybeContextualArg<ContextOf<A>>
  ) {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.LIST_BY, true)
    ).for(this.listBy);
    log.verbose(
      `listing ${Model.tableName(this.class)} by ${key as string} ${order}`
    );
    return (await this.statement(
      this.listBy.name,
      key,
      { direction: order },
      ...ctxArgs
    )) as any;
  }

  override async findBy(
    key: keyof M,
    value: any,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M[]> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.FIND_BY, true)
    ).for(this.findBy);
    log.verbose(
      `finding ${Model.tableName(this.class)} with ${key as string} ${value}`
    );
    return (await this.statement(
      this.findBy.name,
      key,
      value,
      {},
      ...ctxArgs
    )) as any;
  }

  override async findOneBy(
    key: keyof M,
    value: any,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.FIND_ONE_BY, true)
    ).for(this.findOneBy);
    log.verbose(
      `finding ${Model.tableName(this.class)} with ${key as string} ${value}`
    );
    return (await this.statement(
      this.findOneBy.name,
      key,
      value,
      {},
      ...ctxArgs
    )) as any;
  }

  override async statement(
    name: string,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<any> {
    const { log, ctx, ctxArgs } = (
      await this.logCtx(args, PersistenceKeys.STATEMENT, true)
    ).for(this.statement);
    const argList = ctxArgs.slice(0, -1);
    const lastArg = argList[argList.length - 1];
    const hasParams =
      typeof lastArg === "object" &&
      lastArg !== null &&
      !Array.isArray(lastArg);
    const params = hasParams
      ? (argList.pop() as Record<string, any>)
      : undefined;
    const query: PreparedStatement<any> = {
      class: this.class,
      args: argList,
      method: name,
      params: params,
    } as PreparedStatement<any>;
    const req = this.adapter.toRequest(query, ctx);
    log.verbose(`Executing prepared statement ${name}`);
    return this.adapter.parseResponse(
      this.class,
      name,
      await this.request(req, ...ctxArgs)
    );
  }

  async request<R>(
    details: Q,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<R> {
    let contextualizeArgs: any;

    if (args.length && args[args.length - 1] instanceof Context) {
      contextualizeArgs = this.logCtx(args, this.request);
    } else {
      contextualizeArgs = (
        await this.logCtx(args, OperationKeys.READ, true)
      ).for(this.request);
    }
    const { ctxArgs } = contextualizeArgs;

    return this.adapter.request<R>(details, ...ctxArgs);
  }

  @prepared()
  override async countOf(
    key?: keyof M,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<number> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.COUNT_OF, true)
    ).for(this.countOf);
    log.verbose(
      `counting ${Model.tableName(this.class)}${key ? ` by ${key as string}` : ""}`
    );
    const stmtArgs: any[] = key ? [key, {}] : [{}];
    return (await this.statement(
      this.countOf.name,
      ...stmtArgs,
      ...ctxArgs
    )) as any;
  }

  @prepared()
  override async maxOf<K extends keyof M>(
    key: K,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M[K]> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.MAX_OF, true)
    ).for(this.maxOf);
    log.verbose(`finding max of ${key as string} in ${Model.tableName(this.class)}`);
    return (await this.statement(this.maxOf.name, key, {}, ...ctxArgs)) as any;
  }

  @prepared()
  override async minOf<K extends keyof M>(
    key: K,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M[K]> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.MIN_OF, true)
    ).for(this.minOf);
    log.verbose(`finding min of ${key as string} in ${Model.tableName(this.class)}`);
    return (await this.statement(this.minOf.name, key, {}, ...ctxArgs)) as any;
  }

  @prepared()
  override async avgOf<K extends keyof M>(
    key: K,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<number> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.AVG_OF, true)
    ).for(this.avgOf);
    log.verbose(`calculating avg of ${key as string} in ${Model.tableName(this.class)}`);
    return (await this.statement(this.avgOf.name, key, {}, ...ctxArgs)) as any;
  }

  @prepared()
  override async sumOf<K extends keyof M>(
    key: K,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<number> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.SUM_OF, true)
    ).for(this.sumOf);
    log.verbose(`calculating sum of ${key as string} in ${Model.tableName(this.class)}`);
    return (await this.statement(this.sumOf.name, key, {}, ...ctxArgs)) as any;
  }

  @prepared()
  override async distinctOf<K extends keyof M>(
    key: K,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M[K][]> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.DISTINCT_OF, true)
    ).for(this.distinctOf);
    log.verbose(
      `finding distinct values of ${key as string} in ${Model.tableName(this.class)}`
    );
    return (await this.statement(
      this.distinctOf.name,
      key,
      {},
      ...ctxArgs
    )) as any;
  }

  @prepared()
  override async groupOf<K extends keyof M>(
    key: K,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<Record<string, M[]>> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.GROUP_OF, true)
    ).for(this.groupOf);
    log.verbose(`grouping ${Model.tableName(this.class)} by ${key as string}`);
    return (await this.statement(
      this.groupOf.name,
      key,
      {},
      ...ctxArgs
    )) as any;
  }
}
