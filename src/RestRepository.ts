import { Repository } from "@decaf-ts/core";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { HttpAdapter } from "./adapter";
import { Context } from "@decaf-ts/db-decorators";
import { HttpFlags } from "./types";

export class RestRepository<
  M extends Model,
  Q,
  A extends HttpAdapter<any, Q, F, C>,
  F extends HttpFlags = HttpFlags,
  C extends Context<F> = Context<F>,
> extends Repository<M, Q, A> {
  constructor(adapter: A, clazz?: Constructor<M>) {
    super(adapter, clazz);
  }
}
