/* eslint-disable @typescript-eslint/no-unused-vars */
import { AxiosHttpAdapter } from "../../src/axios";
import { HttpAdapter, HttpConfig } from "../../src";
import { Axios } from "axios";
import { Context, createdAt, pk, Repository, updatedAt } from "@decaf-ts/core";
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

  let requestMock: any;

  beforeEach(function () {
    jest.clearAllMocks();
    jest.resetAllMocks();
    requestMock = jest.spyOn(adapter.client as Axios, "request");
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
    requestMock.mockImplementation(async (details: any, ...args: any[]) => {
      return {
        status: 200,
        body: new ComposedTestModel(
          Object.assign({}, model, {
            id: `${model.name}_${model.age}`,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        ),
      };
    });
    created = await repo.create(model);
    expect(created).toBeDefined();
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `${cfg.protocol}://${cfg.host}/${table}/${model.name}/${model.age}`,
        method: "POST",
        data: expect.any(String),
        headers: expect.any(Object),
      })
    );

    expect(created).toBeInstanceOf(ComposedTestModel);
    expect(created.equals(model)).toBe(false);
    expect(created.equals(model, "createdAt", "updatedAt", "id")).toBe(true);
  });

  it("reads", async function () {
    requestMock.mockImplementation(async () => {
      return { status: 200, body: created };
    });
    const read = await repo.read(created.id);
    expect(read).toBeDefined();
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: encodeURI(
          `${cfg.protocol}://${cfg.host}/${table}/${model.name}/${created.age}`
        ),
        method: "GET",
      })
    );
    expect(read).toBeInstanceOf(ComposedTestModel);
    expect(read.equals(created)).toBe(true);
  });

  it("updates", async function () {
    const toUpdate = new ComposedTestModel(
      Object.assign({}, created, {
        address: "other",
      })
    );
    requestMock.mockImplementation(async () => {
      return {
        status: 200,
        body: new ComposedTestModel(
          Object.assign({}, toUpdate, {
            updatedAt: new Date(),
          })
        ),
      };
    });

    updated = await repo.update(toUpdate);
    expect(updated).toBeDefined();
    expect(requestMock).toHaveBeenCalled();
    expect(requestMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: `${cfg.protocol}://${cfg.host}/${table}/${model.name}/${model.age}`,
        method: "PUT",
        data: expect.any(String),
      })
    );

    expect(updated).toBeInstanceOf(ComposedTestModel);
    expect(updated.equals(created)).toBe(false);
    expect(updated.equals(created, "updatedAt", "address")).toBe(true);
  });

  it("deletes", async function () {
    requestMock.mockImplementation(async () => {
      return { status: 200, body: model };
    });
    const deleted = await repo.delete(created.id);
    expect(deleted).toBeDefined();
    expect(requestMock).toHaveBeenCalled();
    expect(requestMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: encodeURI(
          `${cfg.protocol}://${cfg.host}/${table}/${model.name}/${model.age}`
        ),
        method: "DELETE",
      })
    );
  });
});
