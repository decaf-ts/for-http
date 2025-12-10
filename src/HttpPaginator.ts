import { OrderDirection, Paginator, QueryClause } from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { HttpQuery } from "./types";
import { Constructor } from "@decaf-ts/decoration";
import { HttpAdapter } from "./adapter";
import { Context, OperationKeys } from "@decaf-ts/db-decorators";

export class HttpPaginator<
  M extends Model,
  A extends HttpAdapter<any, any, any, HttpQuery, any>,
> extends Paginator<M, M, HttpQuery> {
  constructor(
    adapter: A,
    query: HttpQuery,
    size: number,
    clazz: Constructor<M>
  ) {
    super(adapter, query, size, clazz);
  }

  async page(page: number = 1, ...args: any[]): Promise<M[]> {
    const contextArgs = await Context.args<M, any>(
      OperationKeys.READ,
      this.clazz,
      args,
      this.adapter
    );
    const statement = this.prepare(this.statement);
    page = this.validatePage(page);

    const results: any[] = await this.adapter.raw(
      statement,
      ...contextArgs.args
    );
    this._currentPage = page;
    return results;
  }

  protected prepare(rawStatement: HttpQuery): HttpQuery {
    // only support main attr for now before implementing pageBy
    const attr = rawStatement.method.split(
      new RegExp(
        `${[QueryClause.FIND_BY, QueryClause.SELECT, QueryClause.AND, QueryClause.OR].join("|")}`
      )
    )[0];
    let orderBy = rawStatement.method.split(QueryClause.ORDER_BY);
    if (orderBy.length > 1) {
      orderBy = orderBy[1].split(
        new RegExp(`${[QueryClause.THEN_BY, QueryClause.GROUP_BY].join("|")}`)
      );
      orderBy = [
        attr,
        orderBy[0].includes(OrderDirection.ASC)
          ? OrderDirection.ASC
          : OrderDirection.DSC,
      ];
    }

    return Object.assign({}, rawStatement, {
      method: "pageBy",
      args: [attr, orderBy[1]],
    });
  }
}
