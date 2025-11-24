import { RestService } from "../../src/RestService";
import { HttpAdapter } from "../../src/adapter";
import type { HttpConfig } from "../../src/types";
import {
  InternalError,
  BaseError,
  Context,
  PrimaryKeyType,
  id,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { Model, ModelArg, model } from "@decaf-ts/decorator-validation";
import { Constructor, prop } from "@decaf-ts/decoration";
import { ContextualArgs } from "../../../core/src/index";

class TestHttpAdapter extends HttpAdapter<HttpConfig, any, any, any> {
  private readonly observerEntries: { observer: any; filter?: any }[] = [];

  constructor(config: HttpConfig, alias?: string) {
    super(config, "test-http", alias);
  }
  protected override getClient() {
    return {} as any;
  }
  override async request<V>(details: any): Promise<V> {
    return details as V;
  }
  async create<M extends Model>(
    tableName: Constructor<M>,
    id: PrimaryKeyType,
    model: Record<string, any>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: ContextualArgs<Context>
  ): Promise<Record<string, any>> {
    return { ...model, created: true };
  }
  async read<M extends Model>(
    tableName: Constructor<M>,
    id: PrimaryKeyType,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: ContextualArgs<Context>
  ): Promise<Record<string, any>> {
    return { id, tableName } as any;
  }
  async update(
    tableName: string,
    id: PrimaryKeyType,
    model: Record<string, any>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: ContextualArgs<Context>
  ): Promise<Record<string, any>> {
    return { ...model, updated: true };
  }
  async delete(
    tableName: string,
    id: PrimaryKeyType,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: ContextualArgs<Context>
  ): Promise<Record<string, any>> {
    return { id, deleted: true } as any;
  }

  parseError<E extends BaseError>(err: Error): E {
    throw err;
  }

  override observe(observer: any, filter?: any): void {
    if (this.observerEntries.some((entry) => entry.observer === observer))
      return;
    this.observerEntries.push({ observer, filter });
  }

  override unObserve(observer: any): void {
    const index = this.observerEntries.findIndex(
      (entry) => entry.observer === observer
    );
    if (index === -1) throw new InternalError("Observer not registered");
    this.observerEntries.splice(index, 1);
  }

  override async updateObservers<M extends Model>(
    tableName: Constructor<M>,
    operation: string,
    id: PrimaryKeyType,
    ...args: ContextualArgs<Context>
  ): Promise<void> {
    await Promise.all(
      this.observerEntries.map(async ({ observer }) => {
        try {
          await observer.refresh(tableName, operation, id, ...args);
        } catch {
          // swallow observer errors to mimic production behavior
        }
      })
    );
  }
}

@model()
class Dummy extends Model {
  @id()
  id!: string;

  @prop()
  name?: string;

  constructor(obj?: ModelArg<Dummy>) {
    super(obj);
  }
}

describe("RestService integration", () => {
  const config: HttpConfig = { protocol: "http", host: "localhost" };
  const buildAdapter = () =>
    new TestHttpAdapter(config, `svc-${Math.random()}`);

  test("class getter should throw when no clazz provided", () => {
    const svc = new RestService<any, any, any>(buildAdapter() as any);
    expect(() => (svc as any).class).toThrow(InternalError);
  });

  test("class and pk getters should work when clazz provided", () => {
    const svc = new RestService<Dummy, any, any>(buildAdapter() as any, Dummy);
    expect((svc as any).class).toBe(Dummy);
    expect((svc as any).pk).toBe("id");
    // cached path
    expect((svc as any).pk).toBe("id");
  });

  test("CRUD operations should prepare, delegate to adapter, and revert", async () => {
    const svc = new RestService<Dummy, any, any>(buildAdapter() as any, Dummy);
    const created = await svc.create(new Dummy({ id: "1", name: "A" }));
    expect(created).toBeInstanceOf(Dummy);
    expect(created.id).toBe("1");
    // name comes back from adapter
    expect(created.name).toBe("A");

    const read = await svc.read("2");
    expect(read.id).toBe("2");

    const updated = await svc.update(new Dummy({ id: "3", name: "B" }));
    expect(updated.id).toBe("3");
    expect(updated.name).toBe("B");

    const deleted = await svc.delete("4");
    expect(deleted.id).toBe("4");
  });

  test("Bulk operations createAll/readAll/updateAll/deleteAll", async () => {
    const svc = new RestService<Dummy, any, any>(buildAdapter() as any, Dummy);
    const models = [
      new Dummy({ id: "1", name: "a" }),
      new Dummy({ id: "2", name: "b" }),
    ];

    const created = await svc.createAll(models);
    expect(created).toHaveLength(2);
    expect(created[0]).toBeInstanceOf(Dummy);

    const read = await svc.readAll(["1", "2"]);
    expect(read.map((m) => m.id)).toEqual(["1", "2"]);

    const updated = await svc.updateAll(models);
    expect(updated.map((m) => m.id)).toEqual(["1", "2"]);

    const deleted = await svc.deleteAll(["1", "2"]);
    expect(deleted.map((m) => m.id)).toEqual(["1", "2"]);
  });

  test("observe/unObserve and updateObservers", async () => {
    const svc = new RestService<Dummy, any, any>(buildAdapter() as any, Dummy);

    const calls: any[] = [];
    const okObserver = {
      refresh: async (...args: any[]) => calls.push(["ok", args]),
    };
    const secondObserver = {
      refresh: async (...args: any[]) => calls.push(["second", args]),
    };

    svc.observe(okObserver as any);
    // duplicate should throw
    expect(() => svc.observe(okObserver as any)).toThrow(InternalError);

    svc.observe(secondObserver as any);

    const ctx = await Context.from(
      OperationKeys.CREATE,
      {},
      Dummy as Constructor<Dummy>
    );
    ctx.accumulate({ breakOnHandlerError: false });
    await svc.updateObservers("users", "CREATE", "1", ctx as any);
    expect(calls.length).toBe(2);

    // remove ok observer
    svc.unObserve(okObserver as any);
    // removing again should throw
    expect(() => svc.unObserve(okObserver as any)).toThrow(InternalError);
  });
});
