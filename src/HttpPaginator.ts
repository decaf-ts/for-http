import {
  MaybeContextualArg,
  Paginator,
  PreparedStatement,
  UnsupportedError,
} from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { Constructor } from "@decaf-ts/decoration";
import { HttpAdapter } from "./adapter";
import { ContextualArgs } from "@decaf-ts/core";

export class HttpPaginator<
  M extends Model,
  Q extends PreparedStatement<M>,
  A extends HttpAdapter<any, any, any, Q, any>,
> extends Paginator<M, M[], Q> {
  constructor(adapter: A, query: Q, size: number, clazz: Constructor<M>) {
    super(adapter, query, size, clazz);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected prepare(rawStatement: Q): Q {
    throw new UnsupportedError(
      `Raw query access must be implemented by a subclass. only prepared statements are natively available`
    );
  }

  protected override async pagePrepared(
    page?: number,
    ...argz: ContextualArgs<any>
  ) {
    return this.apply(await super.pagePrepared(page, ...argz));
    // const repo = Repository.forModel(this.clazz, this.adapter.alias);
    // const statement = this.query as PreparedStatement<M>;
    // const { method, args, params } = statement;
    // const regexp = new RegExp(
    //   `^${PreparedStatementKeys.FIND_BY}|${PreparedStatementKeys.LIST_BY}`,
    //   "gi"
    // );
    // if (!method.match(regexp))
    //   throw new UnsupportedError(
    //     `Method ${method} is not supported for pagination`
    //   );
    // regexp.lastIndex = 0;
    // const pagedMethod = method.replace(regexp, PreparedStatementKeys.PAGE_BY);
    // const result = repo.statement(
    //   pagedMethod,
    //   ...args,
    //   page,
    //   Object.assign({}, params, { limit: this.size }),
    //   ...argz
    // );
    // return result;
  }

  override page(
    page: number = 1,
    ...args: MaybeContextualArg<any>
  ): Promise<M[]> {
    return super.page(page, ...args); // this will fail for non-prepared statements
  }
}
