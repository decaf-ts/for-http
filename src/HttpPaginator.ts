import {
  Context,
  Paginator,
  PreparedStatement,
  QueryError,
} from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { Constructor } from "@decaf-ts/decoration";
import { HttpAdapter } from "./adapter";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { OrderDirection, PreparedStatementKeys } from "../../core/src/index";

export class HttpPaginator<
  M extends Model,
  Q extends PreparedStatement<M>,
  A extends HttpAdapter<any, any, any, Q, any>,
> extends Paginator<M, M, Q> {
  constructor(adapter: A, query: Q, size: number, clazz: Constructor<M>) {
    super(adapter, query, size, clazz);
  }

  async page(page: number = 1, ...args: any[]): Promise<M[]> {
    const contextArgs = await Context.args<M, any>(
      OperationKeys.READ,
      this.clazz,
      args,
      this.adapter
    );

    let statement = Object.assign({}, this.statement, {
      args: [...this.statement.args],
      params: { ...this.statement.params },
    });
    if (!this.statement.method.startsWith(PreparedStatementKeys.PAGE_BY))
      statement = this.prepare(statement) as any;
    statement.args.push(page);
    page = this.validatePage(page);

    const results: any[] = await this.adapter.raw(
      statement,
      ...contextArgs.args
    );
    this._currentPage = page;
    return results;
  }

  protected prepare(rawStatement: Q): Q {
    const match = new RegExp(
      `^(${PreparedStatementKeys.FIND_BY}|${PreparedStatementKeys.LIST_BY})`,
      "gi"
    ).exec(rawStatement.method);
    if (!match)
      throw new QueryError(`Can't prepare statement ${rawStatement.method}`);
    return Object.assign({}, rawStatement, {
      method: rawStatement.method.replace(
        match[1],
        PreparedStatementKeys.PAGE_BY
      ),
      args: [...rawStatement.args, this.size],
      params: {
        direction: rawStatement.params
          ? rawStatement.params.direction
          : OrderDirection.DSC,
      },
    });
  }
}
