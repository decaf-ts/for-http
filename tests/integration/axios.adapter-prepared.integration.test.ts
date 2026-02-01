import { AxiosHttpAdapter } from "../../src/axios/axios";
import type { HttpConfig } from "../../src/types";
import { Context, PreparedStatementKeys } from "@decaf-ts/core";
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
import { RestService } from "../../src/RestService";
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  request: async (opts: any, ctx: any) => ({
    status: 200,
  }),
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
      operation: PreparedStatementKeys.FIND_ONE_BY,
      affectedTables: [],
    });

    const repo = Repository.forModel(TestModel);
    expect(repo).toBeInstanceOf(RestService);

    const mock = jest.spyOn(client, "request");

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const found = await repo.findOneBy("id", 1, ctx);

    expect(mock).toHaveBeenCalledWith({
      headers: {},
      method: "GET",
      url: expect.stringContaining(
        `/${table}/${PersistenceKeys.STATEMENT}/findOneBy/id/1`
      ),
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const list = await repo.listBy("id", "asc" as any, ctx);

    expect(mock).toHaveBeenLastCalledWith({
      headers: {},
      method: "GET",
      url: expect.stringContaining(
        `/${table}/${PersistenceKeys.STATEMENT}/listBy/id?direction=asc`
      ),
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const page = await repo.paginateBy(
      "id",
      "asc" as any,
      { offset: 1, limit: 10 },
      ctx
    );

    expect(mock).toHaveBeenLastCalledWith({
      headers: {},
      method: "GET",
      url: expect.stringContaining(
        `/${table}/${PersistenceKeys.STATEMENT}/paginateBy/id/1?direction=asc&limit=10`
      ),
    });
  });

  it("handles queries via prepared statements", async () => {
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
      .execute();

    expect(mock).toHaveBeenCalledWith({
      headers: {},
      method: "GET",
      url: expect.stringContaining(
        `/${table}/${PersistenceKeys.STATEMENT}/findByNameAndIdSelectIdOrderById/test/1?direction=asc&limit=10&skip=5`
      ),
    });
  });

  it("handles paging via prepared statements using simple queries", async () => {
    const ctx = new Context().accumulate({
      logger: Logging.for(expect.getState().currentTestName),
      operation: PreparedStatementKeys.PAGE_BY,
      affectedTables: [TestModel],
    });

    const repo = Repository.forModel(TestModel);
    expect(repo).toBeInstanceOf(RestService);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const mock = jest.spyOn(client, "request").mockImplementation((req) => {
      return {
        status: 200,
        body: {
          current: 1,
          total: 8,
          count: 8,
          data: [{}],
        },
      } as any;
    });

    const paginator = await repo
      .select()
      .where(repo.attr("name").eq("test"))
      .orderBy(["name", OrderDirection.ASC])
      .paginate(1);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const page = await paginator.page(1, ctx);

    expect(mock).toHaveBeenCalledWith({
      headers: {},
      method: "GET",
      url: expect.stringContaining(
        `/${table}/${PersistenceKeys.STATEMENT}/paginateBy/name/test?direction=asc&limit=1&offset=1`
      ),
    });
  });

  it("streams multi-page results as models when using prepared pagination", async () => {
    const ctx = new Context().accumulate({
      logger: Logging.for(expect.getState().currentTestName),
      operation: PreparedStatementKeys.PAGE_BY,
      affectedTables: [TestModel],
    });

    const repo = Repository.forModel(TestModel);
    expect(repo).toBeInstanceOf(RestService);

    const mock = jest
      .spyOn(client, "request")
      .mockImplementationOnce(() => ({
        status: 200,
        body: {
          current: 1,
          total: 2,
          count: 2,
          data: [{ id: "1", name: "First" }],
        },
      }))
      .mockImplementationOnce(() => ({
        status: 200,
        body: {
          current: 2,
          total: 2,
          count: 2,
          data: [{ id: "2", name: "Second" }],
        },
      }));

    const paginator = await repo
      .select()
      .where(repo.attr("name").eq("multi"))
      .orderBy(["name", OrderDirection.ASC])
      .paginate(1);

    const firstPage = await paginator.page(1, ctx);
    const secondPage = await paginator.page(2, ctx);

    expect(firstPage).toHaveLength(1);
    expect(secondPage).toHaveLength(1);
    expect(firstPage[0]).toBeInstanceOf(TestModel);
    expect(secondPage[0]).toBeInstanceOf(TestModel);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls[0][0].url).toContain("offset=1");
    expect(mock.mock.calls[1][0].url).toContain("offset=2");
  });

  it("handles paging via prepared statements using complex queries", async () => {
    const ctx = new Context().accumulate({
      logger: Logging.for(expect.getState().currentTestName),
      operation: PreparedStatementKeys.PAGE_BY,
      affectedTables: [TestModel],
    });

    const repo = Repository.forModel(TestModel);
    expect(repo).toBeInstanceOf(RestService);

    const mock = jest
      .spyOn(client, "request")
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .mockImplementation((opts: any, ctx: any) => {
        return {
          status: 200,
          body: {
            current: 1,
            total: 8,
            count: 8,
            data: [{}],
          },
        } as any;
      });
    const paginator = await repo
      .select(["id"])
      .where(repo.attr("name").eq("test").and(repo.attr("id").eq(1)))
      .orderBy(["id", OrderDirection.ASC])
      .paginate(10);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const page = await paginator.page(1, ctx);

    expect(mock).toHaveBeenCalledWith({
      headers: {},
      method: "GET",
      url: expect.stringContaining(
        `/${table}/${PersistenceKeys.STATEMENT}/paginateByNameAndIdSelectIdOrderById/test/1?direction=asc&limit=10&offset=1`
      ),
    });
  });

  it("handles the new find statement through prepared statements", async () => {
    const ctx = new Context().accumulate({
      logger: Logging.for(expect.getState().currentTestName),
      operation: PreparedStatementKeys.FIND,
      affectedTables: [TestModel],
    });

    const repo = Repository.forModel(TestModel);
    const mock = jest
      .spyOn(client, "request")
      .mockImplementation(async () => ({
        status: 200,
        body: [{ id: "1", name: "Matcher" }],
      }));

    const found = await repo.find("Ma", OrderDirection.ASC, ctx);

    const requestUrl = mock.mock.calls[0][0].url;
    expect(requestUrl).toContain(
      `/${table}/${PersistenceKeys.STATEMENT}/find/Ma/asc`
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ name: "Matcher" });
    expect(found[0]).toBeInstanceOf(TestModel);
    expect(found[0].name).toBe("Matcher");
  });

  it("handles the new page statement through prepared statements", async () => {
    const ctx = new Context().accumulate({
      logger: Logging.for(expect.getState().currentTestName),
      operation: PreparedStatementKeys.PAGE,
      affectedTables: [TestModel],
    });

    const repo = Repository.forModel(TestModel);
    const mock = jest
      .spyOn(client, "request")
      .mockImplementation(async () => ({
        status: 200,
        body: {
          current: 1,
          total: 1,
          count: 1,
          data: [{ id: "2", name: "Pager" }],
        },
      }));

    const page = await repo.page(
      "Pa",
      OrderDirection.ASC,
      { offset: 1, limit: 1 },
      ctx
    );

    const requestUrl = mock.mock.calls[0][0].url;
    expect(requestUrl).toContain(
      `/${table}/${PersistenceKeys.STATEMENT}/page/Pa/asc`
    );
    expect(requestUrl).toContain("limit=1");
    expect(requestUrl).toContain("offset=1");
    expect(page.data).toHaveLength(1);
    expect(page.data[0]).toBeInstanceOf(TestModel);
    expect(page.data[0].name).toBe("Pager");
  });
});
