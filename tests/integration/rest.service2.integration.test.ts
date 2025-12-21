import { AxiosHttpAdapter } from "../../src/index";
import { RestService } from "../../src/RestService";
import type { HttpConfig } from "../../src/types";
import { Context, id } from "@decaf-ts/db-decorators";
import { Model, ModelArg, model } from "@decaf-ts/decorator-validation";
import { prop } from "@decaf-ts/decoration";
import { Logging, toKebabCase } from "@decaf-ts/logging";
import { OrderDirection, PersistenceKeys } from "@decaf-ts/core";

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
  let adapter: AxiosHttpAdapter;
  let repo: RestService<Dummy, any, any>;

  const mock = jest.fn();

  const client = {
    post: async (url: string, body: any) => {
      mock("post", url, body);
      return url.includes("bulk") ? [] : {};
    },
    get: async (url: string) => {
      mock("get", url);
      return url.includes("bulk") ? [{}] : {};
    },
    put: async (url: string, body: any) => {
      mock("put", url, body);
      return url.includes("bulk") ? [] : {};
    },
    delete: async (url: string) => {
      mock("delete", url);
      return url.includes("bulk") ? [] : {};
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    request: async (opts: any, ctx: any) => {
      mock(opts);
      return opts.url.includes("bulk") ? [] : {};
    },
  };

  beforeAll(() => {
    adapter = new AxiosHttpAdapter(config);
    adapter["_client" as any] = client;
    repo = new RestService(adapter, Dummy);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    jest.restoreAllMocks();
  });

  test("CRUD operations", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const created = await repo.create(new Dummy({ id: "1", name: "A" }));
    expect(mock).toHaveBeenLastCalledWith(
      "post",
      expect.stringContaining(`/${toKebabCase(Model.tableName(Dummy))}`),
      expect.objectContaining({ id: "1", name: "A" })
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const read = await repo.read("2");
    expect(mock).toHaveBeenLastCalledWith(
      "get",
      expect.stringContaining(`/${toKebabCase(Model.tableName(Dummy))}/2`)
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const updated = await repo.update(new Dummy({ id: "3", name: "B" }));
    expect(mock).toHaveBeenLastCalledWith(
      "put",
      expect.stringContaining(`/${toKebabCase(Model.tableName(Dummy))}`),
      expect.objectContaining({ id: "3", name: "B" })
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const deleted = await repo.delete("4");
    expect(mock).toHaveBeenLastCalledWith(
      "delete",
      expect.stringContaining(`/${toKebabCase(Model.tableName(Dummy))}/4`)
    );
  });

  test("Bulk CRUD operations", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const created = await repo.createAll([new Dummy({ id: "1", name: "A" })]);
    expect(mock).toHaveBeenLastCalledWith(
      "post",
      expect.stringContaining(`/${toKebabCase(Model.tableName(Dummy))}/bulk`),
      [expect.objectContaining({ id: "1", name: "A" })]
    );

    function enc(url) {
      return url.toString();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const read = await repo.readAll(["2", "4"]);
    expect(mock).toHaveBeenLastCalledWith(
      "get",
      expect.stringContaining(
        enc(`/${toKebabCase(Model.tableName(Dummy))}/bulk?ids=2%2C4`)
      )
    );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const updated = await repo.updateAll([new Dummy({ id: "3", name: "B" })]);
    expect(mock).toHaveBeenLastCalledWith(
      "put",
      expect.stringContaining(`/${toKebabCase(Model.tableName(Dummy))}/bulk`),
      [expect.objectContaining({ id: "3", name: "B" })]
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const deleted = await repo.deleteAll(["4", "6"]);
    expect(mock).toHaveBeenLastCalledWith(
      "delete",
      expect.stringContaining(
        enc(`/${toKebabCase(Model.tableName(Dummy))}/bulk?ids=4%2C6`)
      )
    );
  });

  it("handles paging via prepared statements using simple queries", async () => {
    const ctx = new Context().accumulate({
      logger: Logging.for(expect.getState().currentTestName),
    });

    const mock = jest.spyOn(client, "request");

    const paginator = await repo
      .select()
      .orderBy(["name", OrderDirection.ASC])
      .paginate(10);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const page = await paginator.page(1, ctx);

    expect(mock).toHaveBeenCalledWith({
      method: "GET",
      url: expect.stringContaining(
        `/${toKebabCase(Model.tableName(Dummy))}/${PersistenceKeys.STATEMENT}/paginateBy/name/1?direction=asc&limit=10`
      ),
    });
  });
});
