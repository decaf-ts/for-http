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

describe("RestRepository", function () {
  let adapter: HttpAdapter<any, any, any>;
  let repo: RestRepository<OtherTestModel, any, HttpAdapter<any, any, any>>;

  beforeAll(function () {
    adapter = new AxiosHttpAdapter(cfg);
    expect(adapter).toBeDefined();
    repo = new RestRepository(adapter, OtherTestModel);
  });

  let requestMock: any;

  beforeEach(function () {
    jest.clearAllMocks();
    jest.resetAllMocks();
    requestMock = jest.spyOn(adapter.client as Axios, "request");
  });

  const model: OtherTestModel = new OtherTestModel({
    id: 1,
    name: "name",
    age: 18,
  });

  const table = toKebabCase(Model.tableName(OtherTestModel));

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
