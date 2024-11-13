import { Adapter, Repository } from "@decaf-ts/core";
import { Constructor, Model } from "@decaf-ts/decorator-validation";

export class RestRepository<
  M extends Model,
  Q,
  A extends Adapter<any, Q>,
> extends Repository<M, Q, A> {
  constructor(adapter: A, clazz?: Constructor<M>) {
    super(adapter, clazz);
  }
}
