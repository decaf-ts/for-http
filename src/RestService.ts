import {
  BulkCrudOperator,
  Context,
  CrudOperator,
  findPrimaryKey,
  InternalError,
  RepositoryFlags,
} from "@decaf-ts/db-decorators";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { Observable, Observer, Repository } from "@decaf-ts/core";
import { HttpAdapter } from "./adapter";

export class RestService<
    M extends Model,
    Q,
    A extends HttpAdapter<any, Q, F, C>,
    F extends RepositoryFlags,
    C extends Context<F> = Context<F>,
  >
  implements CrudOperator<M>, BulkCrudOperator<M>, Observable
{
  private readonly _class!: Constructor<M>;
  private _pk!: keyof M;

  get class() {
    if (!this._class)
      throw new InternalError("No class definition found for this repository");
    return this._class;
  }

  get pk() {
    if (!this._pk) this._pk = findPrimaryKey(new this.class()).id;
    return this._pk;
  }

  protected observers: Observer[] = [];

  private readonly _adapter!: A;
  private _tableName!: string;

  protected get adapter(): A {
    if (!this._adapter)
      throw new InternalError(
        "No adapter found for this repository. did you use the @uses decorator or pass it in the constructor?"
      );
    return this._adapter;
  }

  protected get tableName() {
    if (!this._tableName) this._tableName = Repository.table(this.class);
    return this._tableName;
  }

  constructor(adapter: A, clazz?: Constructor<M>) {
    this._adapter = adapter;
    if (clazz) this._class = clazz;
  }

  async create(model: M, ...args: any[]): Promise<M> {
    // eslint-disable-next-line prefer-const
    let { record, id } = this.adapter.prepare(model, this.pk);
    record = await this.adapter.create(this.tableName, id, record, ...args);
    return this.adapter.revert(record, this.class, this.pk, id);
  }

  async read(id: string | number, ...args: any[]): Promise<M> {
    const m = await this.adapter.read(this.tableName, id, ...args);
    return this.adapter.revert(m, this.class, this.pk, id);
  }

  async update(model: M, ...args: any[]): Promise<M> {
    // eslint-disable-next-line prefer-const
    let { record, id } = this.adapter.prepare(model, this.pk);
    record = await this.adapter.update(this.tableName, id, record, ...args);
    return this.adapter.revert(record, this.class, this.pk, id);
  }

  async delete(id: string | number, ...args: any[]): Promise<M> {
    const m = await this.adapter.delete(this.tableName, id, ...args);
    return this.adapter.revert(m, this.class, this.pk, id);
  }

  async createAll(models: M[], ...args: any[]): Promise<M[]> {
    if (!models.length) return models;
    const prepared = models.map((m) => this.adapter.prepare(m, this.pk));
    const ids = prepared.map((p) => p.id);
    let records = prepared.map((p) => p.record);
    records = await this.adapter.createAll(
      this.tableName,
      ids as (string | number)[],
      records,
      ...args
    );
    return records.map((r, i) =>
      this.adapter.revert(r, this.class, this.pk, ids[i] as string | number)
    );
  }

  async deleteAll(keys: string[] | number[], ...args: any[]): Promise<M[]> {
    const results = await this.adapter.deleteAll(this.tableName, keys, ...args);
    return results.map((r, i) =>
      this.adapter.revert(r, this.class, this.pk, keys[i])
    );
  }

  async readAll(keys: string[] | number[], ...args: any[]): Promise<M[]> {
    const records = await this.adapter.readAll(this.tableName, keys, ...args);
    return records.map((r, i) =>
      this.adapter.revert(r, this.class, this.pk, keys[i])
    );
  }

  async updateAll(models: M[], ...args: any[]): Promise<M[]> {
    const records = models.map((m) => this.adapter.prepare(m, this.pk));
    const updated = await this.adapter.updateAll(
      this.tableName,
      records.map((r) => r.id),
      records.map((r) => r.record),
      ...args
    );
    return updated.map((u, i) =>
      this.adapter.revert(u, this.class, this.pk, records[i].id)
    );
  }

  /**
   * @summary Registers an {@link Observer}
   * @param {Observer} observer
   *
   * @see {Observable#observe}
   */
  observe(observer: Observer): void {
    const index = this.observers.indexOf(observer);
    if (index !== -1) throw new InternalError("Observer already registered");
    this.observers.push(observer);
  }

  /**
   * @summary Unregisters an {@link Observer}
   * @param {Observer} observer
   *
   * @see {Observable#unObserve}
   */
  unObserve(observer: Observer): void {
    const index = this.observers.indexOf(observer);
    if (index === -1) throw new InternalError("Failed to find Observer");
    this.observers.splice(index, 1);
  }

  /**
   * @summary calls all registered {@link Observer}s to update themselves
   * @param {any[]} [args] optional arguments to be passed to the {@link Observer#refresh} method
   */
  async updateObservers(...args: any[]): Promise<void> {
    const results = await Promise.allSettled(
      this.observers.map((o) => o.refresh(...args))
    );
    results.forEach((result, i) => {
      if (result.status === "rejected")
        console.warn(
          `Failed to update observable ${this.observers[i]}: ${result.reason}`
        );
    });
  }
}
