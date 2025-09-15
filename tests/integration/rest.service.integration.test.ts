import { RestService } from "../../src/RestService";
import { HttpAdapter } from "../../src/adapter";
import type { HttpConfig, HttpFlags } from "../../src/types";
import { Context, InternalError, id } from "@decaf-ts/db-decorators";
import { Model, ModelArg, prop, model } from "@decaf-ts/decorator-validation";

class TestHttpAdapter extends HttpAdapter<HttpConfig, any, any, HttpFlags, Context<HttpFlags>> {
  constructor(config: HttpConfig, alias?: string) {
    super(config, "test-http", alias);
  }
  protected override getClient() {
    return {} as any;
  }
  override async request<V>(details: any): Promise<V> {
    return details as V;
  }
  async create(tableName: string, id: string | number, model: Record<string, any>): Promise<Record<string, any>> {
    return { ...model, created: true };
  }
  async read(tableName: string, id: string | number | bigint): Promise<Record<string, any>> {
    return { id, tableName } as any;
  }
  async update(tableName: string, id: string | number, model: Record<string, any>): Promise<Record<string, any>> {
    return { ...model, updated: true };
  }
  async delete(tableName: string, id: string | number | bigint): Promise<Record<string, any>> {
    return { id, deleted: true } as any;
  }
}

@model()
class Dummy extends Model {
  @id()
  declare id: string;

  @prop()
  name?: string;

  constructor(obj?: ModelArg<Dummy>) {
    super();
    Model.fromObject(this, obj);
  }
}

describe("RestService integration", () => {
  const config: HttpConfig = { protocol: "http", host: "localhost" };
  const adapter = new TestHttpAdapter(config, `svc-${Math.random()}`);

  test("class getter should throw when no clazz provided", () => {
    const svc = new RestService<any, any, any>(adapter as any);
    expect(() => (svc as any).class).toThrow(InternalError);
  });

  test("class and pk getters should work when clazz provided", () => {
    const svc = new RestService<Dummy, any, any>(adapter as any, Dummy);
    expect((svc as any).class).toBe(Dummy);
    expect((svc as any).pk).toBe("id");
    // cached path
    expect((svc as any).pk).toBe("id");
  });

  test("CRUD operations should prepare, delegate to adapter, and revert", async () => {
    const svc = new RestService<Dummy, any, any>(adapter as any, Dummy);
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
    const svc = new RestService<Dummy, any, any>(adapter as any, Dummy);
    const models = [new Dummy({ id: "1", name: "a" }), new Dummy({ id: "2", name: "b" })];

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
    const svc = new RestService<Dummy, any, any>(adapter as any, Dummy);

    const calls: any[] = [];
    const okObserver = { refresh: async (...args: any[]) => calls.push(["ok", args]) };
    const badObserver = { refresh: async () => { throw new Error("nope"); } };

    svc.observe(okObserver as any);
    // duplicate should throw
    expect(() => svc.observe(okObserver as any)).toThrow(InternalError);

    svc.observe(badObserver as any);

    await svc.updateObservers("users", "CREATE", "1");

    // both called
    expect(calls.length).toBe(1);

    // remove ok observer
    svc.unObserve(okObserver as any);
    // removing again should throw
    expect(() => svc.unObserve(okObserver as any)).toThrow(InternalError);
  });
});
