import { AxiosHttpAdapter } from "../../src/axios/axios";
import type { HttpConfig } from "../../src/types";
import { Context, pk } from "@decaf-ts/core";
import { Logging } from "@decaf-ts/logging";
import { InternalError } from "@decaf-ts/db-decorators";
import { Model, ModelArg, required } from "@decaf-ts/decorator-validation";

// Subclass to override client with a minimal implementation
class TestAxiosAdapter extends AxiosHttpAdapter {
  private impl: any;
  constructor(config: HttpConfig, impl: any, alias?: string) {
    super(config, alias);
    this.impl = impl;
  }
  protected override getClient(): any {
    return this.impl;
  }
}

describe("AxiosHttpAdapter integration (no network)", () => {
  const config: HttpConfig = { protocol: "https", host: "example.com" };

  test("request() uses client.request and returns its value", async () => {
    const adapter = new TestAxiosAdapter(
      config,
      { request: async (d: any) => ({ ok: true, d }) },
      `axios-${Math.random()}`
    );
    const res = await adapter.request<any>({
      url: "https://example.com",
    } as any);
    expect(res.ok).toBe(true);
  });

  class Users extends Model {
    @pk()
    id!: number;

    @required()
    name!: string;
    constructor(arg?: ModelArg<Users>) {
      super(arg);
    }
  }

  test("CRUD methods call through to client and return value", async () => {
    const client = {
      post: async (url: string, body: any) => ({
        status: 200,
        body: { method: "post", url, body },
      }),
      get: async (url: string) => ({
        status: 200,
        body: { method: "get", url },
      }),
      put: async (url: string, body: any) => ({
        status: 200,
        body: { method: "put", url, body },
      }),
      delete: async (url: string) => ({
        status: 200,
        body: { method: "delete", url },
      }),
    };
    const adapter = new TestAxiosAdapter(
      config,
      client,
      `axios-${Math.random()}`
    );

    const ctx = new Context().accumulate({ logger: Logging.get() });

    const created = await adapter.create(
      Users,
      1,
      new Users({ name: "A" }),
      ctx
    );
    expect(created.method).toBe("post");
    expect(created.url).toBe("https://example.com/users/1");

    const read = await adapter.read(Users, 2, ctx);
    expect(read.method).toBe("get");
    expect(read.url).toBe("https://example.com/users/2");

    const updated = await adapter.update(Users, 3, { name: "B" }, ctx);
    expect(updated.method).toBe("put");
    expect(updated.url).toBe("https://example.com/users/3");

    const deleted = await adapter.delete(Users, 4, ctx);
    expect(deleted.method).toBe("delete");
    expect(deleted.url).toBe("https://example.com/users/4");
  });

  test("CRUD methods throw parsed error when client fails", async () => {
    const boom = new Error("boom");
    const failingClient = {
      post: async () => {
        throw boom;
      },
      get: async () => {
        throw boom;
      },
      put: async () => {
        throw boom;
      },
      delete: async () => {
        throw boom;
      },
    };
    const adapter = new TestAxiosAdapter(config, failingClient);
    const ctx = new Context().accumulate({ logger: Logging.get() });
    await expect(adapter.create(Users, 1, new Users(), ctx)).rejects.toThrow(
      InternalError
    );
    await expect(adapter.read(Users, 1, ctx)).rejects.toThrow(boom);
    await expect(adapter.update(Users, 1, {}, ctx)).rejects.toThrow(boom);
    await expect(adapter.delete(Users, 1, ctx)).rejects.toThrow(boom);
  });
});
