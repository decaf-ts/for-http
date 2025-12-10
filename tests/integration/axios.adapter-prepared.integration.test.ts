import { AxiosHttpAdapter } from "../../src/axios/axios";
import type { HttpConfig } from "../../src/types";
import { Context } from "@decaf-ts/db-decorators";
import { PersistenceKeys, pk, Repository } from "@decaf-ts/core";
import {
  model,
  Model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { RestService } from "../../src/index";
import { Logging, toKebabCase } from "@decaf-ts/logging";

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

  it("handles prepared statements", async () => {
    const client = {
      post: async (url: string, body: any) => ({ method: "post", url, body }),
      get: async (url: string) => ({ method: "get", url }),
      put: async (url: string, body: any) => ({ method: "put", url, body }),
      delete: async (url: string) => ({ method: "delete", url }),
      request: async (opts: any, ctx: any) => opts,
    };
    const adapter = new TestAxiosAdapter(config, client);

    const ctx = new Context().accumulate({
      logger: Logging.for(expect.getState().currentTestName),
    });

    @model()
    class TestModel extends Model {
      @pk()
      id!: string;
      @required()
      name!: string;

      constructor(arg?: ModelArg<TestModel>) {
        super(arg);
      }
    }

    const repo = Repository.forModel(TestModel);
    expect(repo).toBeInstanceOf(RestService);

    const mock = jest.spyOn(client, "request");

    const found = await repo.findOneBy("id", 1, ctx);

    expect(mock).toHaveBeenCalledWith({
      method: "GET",
      url: expect.stringContaining(
        `/${toKebabCase(TestModel.name)}/${PersistenceKeys.STATEMENT}/findOneBy/id/1`
      ),
    });

    const list = await repo.listBy("id", "asc" as any, ctx);

    expect(mock).toHaveBeenLastCalledWith({
      method: "GET",
      url: expect.stringContaining(
        `/${toKebabCase(TestModel.name)}/${PersistenceKeys.STATEMENT}/listBy/id/asc`
      ),
    });
    const page = await repo.paginateBy("id", "asc" as any, 10, ctx);

    expect(mock).toHaveBeenLastCalledWith({
      method: "GET",
      url: expect.stringContaining(
        `/${toKebabCase(TestModel.name)}/${PersistenceKeys.STATEMENT}/paginateBy/id/asc/10`
      ),
    });

    const firstpage = await page.page(1, ctx);

    expect(firstpage).toBeDefined();
  });
});
