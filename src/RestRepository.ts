import { Repository } from "@decaf-ts/core";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { HttpAdapter } from "./adapter";
import { Context, RepositoryFlags } from "@decaf-ts/db-decorators";

export class RestRepository<
  M extends Model,
  Q,
  A extends HttpAdapter<any, Q, F, C>,
  F extends RepositoryFlags,
  C extends Context<F> = Context<F>,
> extends Repository<M, Q, A> {
  constructor(adapter: A, clazz?: Constructor<M>) {
    super(adapter, clazz);
  }
}
