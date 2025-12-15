import { Condition, Statement, UnsupportedError } from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { HttpAdapter } from "./adapter";
import type { AdapterFlags } from "@decaf-ts/core";

type HttpAdapterQuery<T extends HttpAdapter<any, any, any, any, any>> =
  T extends HttpAdapter<any, any, any, infer Q, any> ? Q : never;

export class HttpStatement<
  M extends Model,
  A extends HttpAdapter<any, any, any, any, any>,
  R,
> extends Statement<M, A, R, HttpAdapterQuery<A>> {
  constructor(adapter: A, overrides?: Partial<AdapterFlags>) {
    super(adapter, overrides);
  }

  protected override build(): HttpAdapterQuery<A> {
    throw new UnsupportedError(
      `This method is only called is prepared statements are not used. If so, a dedicated implementation for the native queries used is required`
    );
  }

  protected override parseCondition(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    condition: Condition<M>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: any[]
  ): HttpAdapterQuery<A> {
    throw new UnsupportedError(
      `This method is only called is prepared statements are not used. Is so, a dedicated implementation for the native queries used is required`
    );
  }
}
