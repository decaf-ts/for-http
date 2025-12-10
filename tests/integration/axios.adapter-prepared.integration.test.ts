import { AxiosHttpAdapter } from "../../src/axios/axios";
import type { HttpConfig } from "../../src/types";
import { Context } from "@decaf-ts/db-decorators";
import {
  OrderDirection,
  PersistenceKeys,
  pk,
  Repository,
} from "@decaf-ts/core";
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
const config: HttpConfig = { protocol: "https", host: "example.com" };

const client = {
  post: async (url: string, body: any) => ({ method: "post", url, body }),
  get: async (url: string) => ({ method: "get", url }),
  put: async (url: string, body: any) => ({ method: "put", url, body }),
  delete: async (url: string) => ({ method: "delete", url }),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  request: async (opts: any, ctx: any) => opts,
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const adapter = new TestAxiosAdapter(config, client);

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

const table = toKebabCase(Model.tableName(TestModel));

describe("AxiosHttpAdapter integration (no network)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    jest.restoreAllMocks();
  });

  it("handles prepared statements", async () => {
    const ctx = new Context().accumulate({
      logger: Logging.for(expect.getState().currentTestName),
    });

    const repo = Repository.forModel(TestModel);
    expect(repo).toBeInstanceOf(RestService);

    const mock = jest.spyOn(client, "request");

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const found = await repo.findOneBy("id", 1, ctx);

    expect(mock).toHaveBeenCalledWith({
      method: "GET",
      url: expect.stringContaining(
        `/${table}/${PersistenceKeys.STATEMENT}/findOneBy/id/1`
      ),
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const list = await repo.listBy("id", "asc" as any, ctx);

    expect(mock).toHaveBeenLastCalledWith({
      method: "GET",
      url: expect.stringContaining(
        `/${table}/${PersistenceKeys.STATEMENT}/listBy/id/asc`
      ),
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const page = await repo.paginateBy("id", "asc" as any, 10, ctx);

    expect(mock).toHaveBeenLastCalledWith({
      method: "GET",
      url: expect.stringContaining(
        `/${table}/${PersistenceKeys.STATEMENT}/paginateBy/id/asc/10`
      ),
    });
  });

  it("handles queries via prepared statements", async () => {
    const ctx = new Context().accumulate({
      logger: Logging.for(expect.getState().currentTestName),
    });

    const repo = Repository.forModel(TestModel);
    expect(repo).toBeInstanceOf(RestService);

    const mock = jest.spyOn(client, "request");

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const result = await repo
      .select(["id"])
      .where(repo.attr("name").eq("test").and(repo.attr("id").eq(1)))
      .orderBy(["id", OrderDirection.ASC])
      .limit(10)
      .offset(5)
      .execute(ctx);

    expect(mock).toHaveBeenCalledWith({
      method: "GET",
      url: expect.stringContaining(
        `/${table}/${PersistenceKeys.STATEMENT}/findByNameAndIdSelectIdOrderByIdAsc/test/1?limit=10&skip=5`
      ),
    });
  });

  it("handles paging via prepared statements using simple queries", async () => {
    const ctx = new Context().accumulate({
      logger: Logging.for(expect.getState().currentTestName),
    });

    const repo = Repository.forModel(TestModel);
    expect(repo).toBeInstanceOf(RestService);

    const mock = jest.spyOn(client, "request");

    const paginator = await repo
      .select()
      .where(repo.attr("name").eq("test"))
      .orderBy(["name", OrderDirection.ASC])
      .paginate(10);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const page = await paginator.page(1, ctx);

    expect(mock).toHaveBeenCalledWith({
      method: "GET",
      url: expect.stringContaining(
        `/${table}/${PersistenceKeys.STATEMENT}/pageBy/name/asc/10/1`
      ),
    });
  });

  it("handles paging via prepared statements using complex queries", async () => {
    const ctx = new Context().accumulate({
      logger: Logging.for(expect.getState().currentTestName),
    });

    const repo = Repository.forModel(TestModel);
    expect(repo).toBeInstanceOf(RestService);

    const mock = jest.spyOn(client, "request");

    const paginator = await repo
      .select(["id"])
      .where(repo.attr("name").eq("test").and(repo.attr("id").eq(1)))
      .orderBy(["id", OrderDirection.ASC])
      .paginate(10);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const page = await paginator.page(1, ctx);

    expect(mock).toHaveBeenCalledWith({
      method: "GET",
      url: expect.stringContaining(
        `/${table}/${PersistenceKeys.STATEMENT}/pageByNameAndIdSelectIdOrderByIdAsc/test/1/10/1`
      ),
    });
  });
});
