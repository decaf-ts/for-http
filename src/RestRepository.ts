import {
  Context,
  ContextOf,
  DirectionLimitOffset,
  MaybeContextualArg,
  OrderDirection,
  PersistenceKeys,
  PreparedStatement,
  PreparedStatementKeys,
  Repository,
  SerializedPage,
} from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { Constructor } from "@decaf-ts/decoration";
import { HttpAdapter } from "./adapter";
import {
  OperationKeys,
  ValidationError,
  enforceDBDecorators,
  reduceErrorsToPrint,
} from "@decaf-ts/db-decorators";

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

  protected override async createAllPrefix(
    models: M[],
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<[M[], ...any[], ContextOf<A>]> {
    const contextArgs = await Context.args<M, ContextOf<A>>(
      OperationKeys.CREATE,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const ignoreHandlers = contextArgs.context.get("ignoreHandlers");
    const ignoreValidate = contextArgs.context.get("ignoreValidation");
    if (!models.length) return [models, ...contextArgs.args] as any;

    models = await Promise.all(
      models.map(async (m) => {
        m = new this.class(m);
        if (!ignoreHandlers)
          await enforceDBDecorators<M, Repository<M, A>, any>(
            this,
            contextArgs.context,
            m,
            OperationKeys.CREATE,
            OperationKeys.ON
          );
        return m;
      })
    );

    if (!ignoreValidate) {
      const ignoredProps =
        contextArgs.context.get("ignoredValidationProperties") || [];

      const errors = await Promise.all(
        models.map((m) => Promise.resolve(m.hasErrors(...ignoredProps)))
      );

      const errorMessages = reduceErrorsToPrint(errors);

      if (errorMessages) throw new ValidationError(errorMessages);
    }
    return [models, ...contextArgs.args] as any;
  }

  override async paginateBy(
    key: keyof M,
    order: OrderDirection,
    size: number,
    ref: { page?: number; bookmark?: string } | number = { page: 1 },
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<SerializedPage<M>> {
    const contextArgs = await Context.args<M, ContextOf<A>>(
      PreparedStatementKeys.PAGE_BY,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const { log, ctxArgs } = this.logCtx(contextArgs.args, this.paginateBy);
    log.verbose(
      `paginating ${Model.tableName(this.class)} with page size ${size}`
    );
    if (typeof ref === "number") ref = { page: ref };

    const params: DirectionLimitOffset = {
      direction: order,
      limit: size,
    };
    if (ref.bookmark) {
      params.offset = ref.bookmark as any;
    }
    return this.statement(
      this.paginateBy.name,
      key,
      ref.page,
      params,
      ...ctxArgs
    );
  }

  override async listBy(
    key: keyof M,
    order: OrderDirection,
    ...args: MaybeContextualArg<ContextOf<A>>
  ) {
    const contextArgs = await Context.args<M, ContextOf<A>>(
      "list",
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const { log, ctxArgs } = this.logCtx(contextArgs.args, this.listBy);
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
    const contextArgs = await Context.args<M, ContextOf<A>>(
      PreparedStatementKeys.FIND_BY,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const { log, ctxArgs } = this.logCtx(contextArgs.args, this.findBy);
    log.verbose(
      `finding all ${Model.tableName(this.class)} with ${key as string} ${value}`
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
    const contextArgs = await Context.args<M, ContextOf<A>>(
      PreparedStatementKeys.FIND_ONE_BY,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const { log, ctxArgs } = this.logCtx(contextArgs.args, this.findOneBy);
    log.verbose(
      `finding One ${Model.tableName(this.class)} with ${key as string} ${value}`
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
    const contextArgs = await Context.args<M, ContextOf<A>>(
      PersistenceKeys.STATEMENT,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const { log, ctxArgs, ctx } = this.logCtx(contextArgs.args, this.statement);
    const params = args.pop();
    const query: PreparedStatement<any> = {
      class: this.class,
      args: args,
      method: name,
      params: params,
    } as PreparedStatement<any>;
    const req = this.adapter.toRequest(query, ctx);
    log.verbose(`Executing prepared statement ${name}`);
    return this.adapter.parseResponse(
      name,
      await this.request(req, ...ctxArgs)
    );
  }

  async request<R>(
    details: Q,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<R> {
    const contextArgs = await Context.args<M, any>(
      "request",
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const { ctxArgs } = this.logCtx(contextArgs.args, this.request);
    return this.adapter.request<R>(details, ...ctxArgs);
  }
}
