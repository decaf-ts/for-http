import {
  ContextualArgs,
  DirectionLimitOffset,
  MaybeContextualArg,
  Paginator,
  PreparedStatement,
  PreparedStatementKeys,
  Repository,
  UnsupportedError,
} from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { Constructor } from "@decaf-ts/decoration";
import { HttpAdapter } from "./adapter";

export class HttpPaginator<
  M extends Model,
  Q extends PreparedStatement<M>,
  A extends HttpAdapter<any, any, any, Q, any>,
> extends Paginator<M, M[], Q> {
  constructor(adapter: A, query: Q, size: number, clazz: Constructor<M>) {
    super(adapter, query, size, clazz);
  }

  protected override async pagePrepared(
    page?: number,
    ...argz: ContextualArgs<any>
  ): Promise<M[]> {
    const repo = Repository.forModel(this.clazz, this.adapter.alias);
    const statement = this.query as PreparedStatement<M>;
    const { method, args, params } = statement;
    const regexp = new RegExp(
      `^${PreparedStatementKeys.FIND_BY}|${PreparedStatementKeys.LIST_BY}`,
      "gi"
    );
    if (!method.match(regexp))
      throw new UnsupportedError(
        `Method ${method} is not supported for pagination`
      );
    regexp.lastIndex = 0;
    const pagedMethod = method.replace(regexp, PreparedStatementKeys.PAGE_BY);

    const preparedArgs = [pagedMethod, ...args];
    const preparedParams: DirectionLimitOffset = {
      direction: params.direction,
      limit: this.size,
      offset: page,
      bookmark: this._bookmark,
    };

    preparedArgs.push(preparedParams);

    const result = await repo.statement(
      ...(preparedArgs as [string, any]),
      ...argz
    );
    return this.apply(result);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected prepare(rawStatement: Q): Q {
    throw new UnsupportedError(
      `Raw query access must be implemented by a subclass. only prepared statements are natively available`
    );
  }

  override page(
    page: number = 1,
    ...args: MaybeContextualArg<any>
  ): Promise<M[]> {
    return super.page(page, ...args); // this will fail for non-prepared statements
  }
}
