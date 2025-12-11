import { AxiosHttpAdapter } from "../../src/axios";
import { HttpAdapter, HttpConfig } from "../../src";
import { Axios } from "axios";
import { createdAt, pk, Repository, updatedAt } from "@decaf-ts/core";
import {
  model,
  ModelArg,
  required,
  step,
} from "@decaf-ts/decorator-validation";
import { RestRepository } from "../../src";

import { composed, TimestampValidator } from "@decaf-ts/db-decorators";
import { Model } from "@decaf-ts/decorator-validation";
import { toKebabCase } from "@decaf-ts/logging";
console.log(TimestampValidator);
const cfg: HttpConfig = {
  protocol: "http",
  host: "localhost:8080",
};

@model()
class ComposedTestModel extends Model {
  @composed(["name", "age"])
  @pk()
  id!: string;

  @required()
  name!: string;

  @required()
  @step(1)
  age!: number;

  @required()
  address!: string;

  @createdAt()
  createdAt!: Date;

  @updatedAt()
  updatedAt!: Date;

  constructor(arg?: ModelArg<ComposedTestModel>) {
    super(arg);
  }
}

describe("RestRepository", function () {
  let adapter: HttpAdapter<any, any, any>;
  let repo: RestRepository<ComposedTestModel, any, HttpAdapter<any, any, any>>;

  beforeAll(function () {
    adapter = new AxiosHttpAdapter(cfg);
    expect(adapter).toBeDefined();
    repo = new RestRepository(adapter, ComposedTestModel);
  });

  let getMock: any;
  let postMock: any;
  let putMock: any;
  let deleteMock: any;

  beforeEach(function () {
    jest.clearAllMocks();
    jest.resetAllMocks();
    getMock = jest.spyOn(adapter.client as Axios, "get");
    postMock = jest.spyOn(adapter.client as Axios, "post");
    putMock = jest.spyOn(adapter.client as Axios, "put");
    deleteMock = jest.spyOn(adapter.client as Axios, "delete");
  });

  const model: ComposedTestModel = new ComposedTestModel({
    name: "name",
    age: 18,
    address: "blah",
  });

  const table = toKebabCase(Model.tableName(ComposedTestModel));

  let created: ComposedTestModel;
  let updated: ComposedTestModel;

  it("finds the right repository", () => {
    repo = Repository.forModel(ComposedTestModel);
    expect(repo).toBeInstanceOf(RestRepository);
  });

  it("creates", async function () {
    postMock.mockImplementation(
      async (url: string, data: Record<string, unknown>) => {
        return Object.assign({}, data);
      }
    );
    created = await repo.create(model);
    expect(created).toBeDefined();
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith(
      `${cfg.protocol}://${cfg.host}/${table}`,
      created,
      { headers: expect.any(Object) }
    );
    expect(created).toBeInstanceOf(ComposedTestModel);
    expect(created.equals(model)).toBe(false);
    expect(created.equals(model, "createdAt", "updatedAt", "id")).toBe(true);
  });

  it("reads", async function () {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getMock.mockImplementation(async (url: string) => {
      return Object.assign({}, created);
    });
    const read = await repo.read(created.id);
    expect(read).toBeDefined();
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith(
      encodeURI(
        `${cfg.protocol}://${cfg.host}/${table}/${model.name}/${model.age}`
      )
    );
    expect(read).toBeInstanceOf(ComposedTestModel);
    expect(read.equals(created)).toBe(true);
  });

  it("updates", async function () {
    putMock.mockImplementation(
      async (url: string, data: Record<string, unknown>) => {
        return Object.assign({}, data);
      }
    );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getMock.mockImplementation(async (url: string, id: string) => {
      return Object.assign({}, created);
    });

    const toUpdate = new ComposedTestModel(
      Object.assign({}, created, { address: "other" })
    );

    updated = await repo.update(toUpdate);
    expect(updated).toBeDefined();
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock).toHaveBeenCalledWith(
      `${cfg.protocol}://${cfg.host}/${table}/${model.name}/${model.age}`,
      updated
    );

    expect(updated).toBeInstanceOf(ComposedTestModel);
    expect(updated.equals(created)).toBe(false);
    expect(updated.equals(created, "updatedAt", "address")).toBe(true);
  });

  it("deletes", async function () {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    deleteMock.mockImplementation(async (url: string, id: string) => {
      return Object.assign({}, updated);
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getMock.mockImplementation(async (url: string, id: string) => {
      return Object.assign({}, updated);
    });
    const deleted = await repo.delete(created.id);
    expect(deleted).toBeDefined();
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledWith(
      encodeURI(
        `${cfg.protocol}://${cfg.host}/${table}/${model.name}/${model.age}`
      )
    );
  });
});
