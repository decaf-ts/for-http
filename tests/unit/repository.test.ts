import { AxiosHttpAdapter } from "../../src/axios";
import { HttpAdapter, HttpConfig } from "../../src";
import { HttpPaginator } from "../../src/HttpPaginator";
import { Axios } from "axios";
import {
  createdAt,
  OrderDirection,
  PreparedStatement,
  pk,
  Repository,
  updatedAt,
} from "@decaf-ts/core";
import {
  model,
  ModelArg,
  required,
  step,
} from "@decaf-ts/decorator-validation";
import { RestRepository } from "../../src";

import { TimestampValidator } from "@decaf-ts/db-decorators";
import { Model } from "@decaf-ts/decorator-validation";
import { toKebabCase } from "@decaf-ts/logging";
console.log(TimestampValidator);
const cfg: HttpConfig = {
  protocol: "http",
  host: "localhost:8080",
};

@model()
class OtherTestModel extends Model {
  @pk({ type: "Number" })
  id!: number;

  @required()
  name!: string;

  @required()
  @step(1)
  age!: number;

  @createdAt()
  createdAt!: Date;

  @updatedAt()
  updatedAt!: Date;

  constructor(arg?: ModelArg<OtherTestModel>) {
    super(arg);
  }
}

const table = toKebabCase(Model.tableName(OtherTestModel));

let adapter: HttpAdapter<any, any, any>;
let repo: RestRepository<OtherTestModel, any, HttpAdapter<any, any, any>>;
let requestMock: jest.SpyInstance;

beforeAll(function () {
  adapter = new AxiosHttpAdapter(cfg);
  expect(adapter).toBeDefined();
  repo = new RestRepository(adapter, OtherTestModel);
});

beforeEach(function () {
  jest.clearAllMocks();
  jest.resetAllMocks();
  requestMock = jest.spyOn(adapter.client as Axios, "request");
});

describe("RestRepository", function () {
  const model: OtherTestModel = new OtherTestModel({
    id: 1,
    name: "name",
    age: 18,
  });

  let created: OtherTestModel;
  let updated: OtherTestModel;

  it("finds the right repository", () => {
    repo = Repository.forModel(OtherTestModel);
    expect(repo).toBeInstanceOf(RestRepository);
  });

  it("creates", async function () {
    const createdBody = Object.assign({}, model, {
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    requestMock.mockImplementation(async () => {
      return { status: 200, body: createdBody };
    });
    created = await repo.create(model);
    expect(created).toBeDefined();
    expect(requestMock).toHaveBeenCalled();
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `${cfg.protocol}://${cfg.host}/${table}/1`,
        data: expect.any(String),
        method: "POST",
        headers: expect.any(Object),
      })
    );
    expect(created).toBeInstanceOf(OtherTestModel);
    expect(created.equals(model)).toBe(false);
    expect(created.equals(model, "createdAt", "updatedAt")).toBe(true);
  });

  it("reads", async function () {
    requestMock.mockImplementation(async () => {
      return { status: 200, body: Object.assign({}, created) };
    });
    const read = await repo.read(model.id);
    expect(read).toBeDefined();
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: encodeURI(`${cfg.protocol}://${cfg.host}/${table}/${model.id}`),
        method: "GET",
      })
    );
    expect(read).toBeInstanceOf(OtherTestModel);
    expect(read.equals(created)).toBe(true);
  });

  it("updates", async function () {
    const toUpdate = new OtherTestModel(
      Object.assign({}, { id: model.id, age: model.age }, { name: "updated" })
    );
    const updatedBody = Object.assign({}, created, toUpdate, {
      updatedAt: new Date(),
    });
    requestMock.mockImplementation(async (details: any) => {
      const method = (details.method || "GET").toUpperCase();
      if (method === "GET") {
        return { status: 200, body: Object.assign({}, created) };
      }
      return { status: 200, body: updatedBody };
    });

    updated = await repo.update(toUpdate);
    expect(updated).toBeDefined();
    expect(requestMock).toHaveBeenCalled();
    expect(requestMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: `${cfg.protocol}://${cfg.host}/${table}/${model.id}`,
        method: "PUT",
        data: expect.any(String),
      })
    );

    expect(updated).toBeInstanceOf(OtherTestModel);
    expect(updated.equals(created)).toBe(false);
    expect(updated.age).toBe(created.age);
    expect(updated.name).toBe(toUpdate.name);
  });

  it("deletes", async function () {
    requestMock.mockImplementation(async () => {
      return { status: 200, body: Object.assign({}, updated) };
    });

    const deleted = await repo.delete(model.id);
    expect(deleted).toBeDefined();
    expect(requestMock).toHaveBeenCalled();
    expect(requestMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: encodeURI(`${cfg.protocol}://${cfg.host}/${table}/${model.id}`),
        method: "DELETE",
      })
    );
  });
});

describe("RestRepository default query statements", () => {
  it("issues find via the statement API", async () => {
    const value = "1Alpha";
    const payload = [{ id: 101, name: "1Alpha", age: 24 }];
    requestMock.mockImplementation(async () => ({
      status: 200,
      body: payload,
    }));

    const matches = await repo.find(value, OrderDirection.ASC);
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe("1Alpha");

    const call = requestMock.mock.calls[requestMock.mock.calls.length - 1][0];
    expect(call.url).toContain(`${table}/statement/find/${value}/asc`);
  });

  it("routes page through the statement API with params", async () => {
    const value = "a1";
    const pageResponse = {
      status: 200,
      body: {
        data: [{ id: 2, name: "a1", age: 33 }],
        current: 1,
        count: 1,
        total: 1,
        bookmark: "bk-1",
      },
    };
    requestMock.mockImplementation(async () => pageResponse);

    const page = await repo.page(value, OrderDirection.DESC, {
      offset: 1,
      limit: 2,
      bookmark: "bk-1",
    });

    expect(page.current).toBe(1);
    expect(page.data[0].name).toBe("a1");

    const call = requestMock.mock.calls[requestMock.mock.calls.length - 1][0];
    expect(call.url).toContain(`${table}/statement/page/${value}/asc`);
    expect(call.url).toContain("limit=2");
    expect(call.url).toContain("bookmark=bk-1");
  });
});

describe("HttpPaginator navigation helpers", () => {
  class DummyPaginator extends HttpPaginator<
    OtherTestModel,
    PreparedStatement<OtherTestModel>,
    HttpAdapter<any, any, any, PreparedStatement<OtherTestModel>, any>
  > {
    protected async page(
      page: number = 1,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ...args: any[]
    ): Promise<OtherTestModel[]> {
      this._currentPage = page;
      this._bookmark = `bookmark-${page}`;
      return [];
    }
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("advances and rewinds sequential pages", async () => {
    const logCtxResult: any = {
      ctxArgs: [],
      ctx: {} as any,
      log: {} as any,
    };
    logCtxResult.log.for = () => logCtxResult.log;
    logCtxResult.for = () => logCtxResult;
    const adapterStub = {
      alias: "http",
      logCtx: jest.fn().mockReturnValue(logCtxResult),
    } as any;

    const paginator = new DummyPaginator(
      adapterStub,
      {
        method: "find",
        args: [],
        params: {},
      } as PreparedStatement<OtherTestModel>,
      3,
      OtherTestModel
    );

    paginator.apply({
      data: [],
      current: 1,
      count: 2,
      total: 2,
      bookmark: "bookmark-1",
    });

    const spy = jest.spyOn(paginator, "page");

    await paginator.next();
    expect(spy).toHaveBeenLastCalledWith(2);
    expect(paginator.current).toBe(2);

    await paginator.previous();
    expect(spy).toHaveBeenLastCalledWith(1);
    expect(paginator.current).toBe(1);
  });
});
