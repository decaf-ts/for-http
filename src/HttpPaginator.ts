import {
  MaybeContextualArg,
  Paginator,
  PreparedStatement,
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
