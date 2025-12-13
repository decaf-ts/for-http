import "@decaf-ts/core";
import { Repository } from "@decaf-ts/core";
import { AxiosHttpAdapter } from "../../src/axios";
import { Axios } from "axios";
import { HttpAdapter } from "../../src";
import { HttpConfig } from "../../src";
import { TestModel } from "./TestModel";
import { RestService } from "../../src";
import { IRepository } from "@decaf-ts/db-decorators";
import { Model } from "@decaf-ts/decorator-validation";
import { toKebabCase } from "@decaf-ts/logging";

const cfg: HttpConfig = {
  protocol: "http",
  host: "localhost:8080",
};

Model.setBuilder(Model.fromModel);

describe("Rest Service", () => {
  let adapter: HttpAdapter<any, unknown, unknown>;
  let repo: IRepository<TestModel>;

  beforeAll(() => {
    adapter = new AxiosHttpAdapter(cfg);
    expect(adapter).toBeDefined();
  });

  let getMock: any;
  let postMock: any;
  let putMock: any;
  let deleteMock: any;

  beforeEach(function () {
    jest.clearAllMocks();
    jest.resetAllMocks();
    getMock = jest
      .spyOn(adapter.client as Axios, "get")
      .mockResolvedValue(Object.assign({}, model));
    postMock = jest.spyOn(adapter.client as Axios, "post");
    putMock = jest.spyOn(adapter.client as Axios, "put");
    deleteMock = jest.spyOn(adapter.client as Axios, "delete");
  });

  const model: TestModel = new TestModel({
    id: "id",
    name: "name",
    age: 18,
  });

  const table = toKebabCase(Model.tableName(TestModel));

  it("finds the right repository", () => {
    repo = Repository.forModel(TestModel);
    expect(repo).toBeInstanceOf(RestService);
  });

  it("creates", async function () {
    postMock.mockImplementation(
      async (url: string, data: Record<string, unknown>) => {
        return Object.assign({}, data);
      }
    );
    const created = await repo.create(model);
    expect(created).toBeDefined();
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith(
      `${cfg.protocol}://${cfg.host}/${table}`,
      model,
      { headers: expect.any(Object) }
    );
    expect(created).toBeInstanceOf(TestModel);
    expect(created.equals(model)).toBe(true);
  });

  it("reads", async function () {
    const read = await repo.read(model.id);
    expect(read).toBeDefined();
    expect(getMock).toHaveBeenCalledTimes(1);

    expect(getMock).toHaveBeenCalledWith(
      encodeURI(`${cfg.protocol}://${cfg.host}/${table}/${model.id}`)
    );
    expect(read).toBeInstanceOf(TestModel);
    expect(read.equals(model)).toBe(true);
  });

  it("updates", async function () {
    putMock.mockImplementation(
      async (url: string, data: Record<string, unknown>) => {
        return Object.assign({}, data);
      }
    );

    const toUpdate = new TestModel(
      Object.assign({}, model, { name: "updated" })
    );

    const updated = await repo.update(toUpdate);
    expect(updated).toBeDefined();
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock).toHaveBeenCalledWith(
      `${cfg.protocol}://${cfg.host}/${table}/${toUpdate.id}`,
      toUpdate
    );

    expect(updated).toBeInstanceOf(TestModel);
    expect(updated.equals(toUpdate)).toBe(true);
  });

  it("deletes", async function () {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    deleteMock.mockImplementation(async (url: string) => {
      return Object.assign({}, model);
    });
    const deleted = await repo.delete(model.id);
    expect(deleted).toBeDefined();
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledWith(
      encodeURI(`${cfg.protocol}://${cfg.host}/${table}/${model.id}`)
    );
  });
});
