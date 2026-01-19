/* eslint-disable @typescript-eslint/no-unused-vars */

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

  let requestMock: any;

  beforeEach(function () {
    jest.clearAllMocks();
    jest.resetAllMocks();
    requestMock = jest.spyOn(adapter.client as Axios, "request");
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
    requestMock.mockImplementation(async (details: any, ...args: any[]) => {
      return { status: 200, body: model };
    });
    const created = await repo.create(model);
    expect(created).toBeDefined();
    expect(requestMock).toHaveBeenCalled();
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `${cfg.protocol}://${cfg.host}/${table}/id`,
        method: "POST",
        data: expect.any(String),
        headers: expect.any(Object),
      })
    );
    expect(created).toBeInstanceOf(TestModel);
    expect(created.equals(model)).toBe(true);
  });

  it("reads", async function () {
    requestMock.mockImplementation(async () => {
      return { status: 200, body: model };
    });
    const read = await repo.read(model.id);
    // expect(read).toBeDefined();
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: encodeURI(`${cfg.protocol}://${cfg.host}/${table}/${model.id}`),
        method: "GET",
      })
    );
  });

  it("updates", async function () {
    const toUpdate = new TestModel(
      Object.assign({}, model, { name: "updated" })
    );
    requestMock.mockImplementation(async (details: any) => {
      const method = (details.method || "GET").toUpperCase();
      if (method === "GET") {
        return { status: 200, body: model };
      }
      return { status: 200, body: toUpdate };
    });

    const updated = await repo.update(toUpdate);
    expect(updated).toBeDefined();
    expect(requestMock).toHaveBeenCalled();
    expect(requestMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: `${cfg.protocol}://${cfg.host}/${table}/${toUpdate.id}`,
        method: "PUT",
        data: expect.any(String),
      })
    );

    expect(updated).toBeInstanceOf(TestModel);
    expect(updated.equals(toUpdate)).toBe(true);
  });

  it("deletes", async function () {
    requestMock.mockImplementation(async () => {
      return { status: 200, body: model };
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
