import { AxiosHttpAdapter, HttpAdapter, HttpConfig } from "../../src";
import { Axios } from "axios";
import { Adapter, pk, Repository } from "@decaf-ts/core";
import { OperationKeys, timestamp } from "@decaf-ts/db-decorators";
import {
  model,
  Model,
  ModelArg,
  required,
  step,
} from "@decaf-ts/decorator-validation";
import { RestRepository } from "../../src";

const cfg: HttpConfig = {
  protocol: "http",
  host: "localhost:8080",
};

Model.setBuilder(Model.fromModel);

@model()
class OtherTestModel extends Model {
  @pk()
  id!: number;

  @required()
  name!: string;

  @required()
  @step(1)
  age!: number;

  @timestamp([OperationKeys.CREATE])
  createdOn!: Date;

  @timestamp()
  updatedOn!: Date;

  constructor(arg?: ModelArg<OtherTestModel>) {
    super(arg);
  }
}

describe("RestRepository", function () {
  let adapter: HttpAdapter<unknown, unknown>;
  let repo: RestRepository<OtherTestModel, unknown, Adapter<unknown, unknown>>;

  beforeAll(function () {
    adapter = new AxiosHttpAdapter(new Axios(), cfg);
    expect(adapter).toBeDefined();
    repo = new RestRepository(adapter, OtherTestModel);
  });

  let getMock: any;
  let postMock: any;
  let putMock: any;
  let deleteMock: any;

  beforeEach(function () {
    jest.clearAllMocks();
    jest.resetAllMocks();
    getMock = jest.spyOn(adapter.native as Axios, "get");
    postMock = jest.spyOn(adapter.native as Axios, "post");
    putMock = jest.spyOn(adapter.native as Axios, "put");
    deleteMock = jest.spyOn(adapter.native as Axios, "delete");
  });

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
    postMock.mockImplementation(
      async (url: string, data: Record<string, unknown>) => {
        return Object.assign({}, data);
      }
    );
    created = await repo.create(model);
    expect(created).toBeDefined();
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith(
      `${cfg.protocol}://${cfg.host}/${Repository.table(OtherTestModel)}`,
      created
    );
    expect(created).toBeInstanceOf(OtherTestModel);
    expect(created.equals(model)).toBe(false);
    expect(created.equals(model, "createdOn", "updatedOn")).toBe(true);
  });

  it("reads", async function () {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getMock.mockImplementation(async (url: string) => {
      return Object.assign({}, created);
    });
    const read = await repo.read(model.id);
    expect(read).toBeDefined();
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith(
      encodeURI(
        `${cfg.protocol}://${cfg.host}/${Repository.table(model)}?id=${model.id}`
      )
    );
    expect(read).toBeInstanceOf(OtherTestModel);
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

    const toUpdate = new OtherTestModel(
      Object.assign({}, { id: model.id }, { name: "updated" })
    );

    const updated = await repo.update(toUpdate);
    expect(updated).toBeDefined();
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock).toHaveBeenCalledWith(
      `${cfg.protocol}://${cfg.host}/${Repository.table(toUpdate)}`,
      updated
    );

    expect(updated).toBeInstanceOf(OtherTestModel);
    expect(updated.equals(created)).toBe(false);
    expect(updated.equals(created, "updatedOn", "name")).toBe(true);
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
    const deleted = await repo.delete(model.id);
    expect(deleted).toBeDefined();
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledWith(
      encodeURI(
        `${cfg.protocol}://${cfg.host}/${Repository.table(model)}?id=${model.id}`
      )
    );
  });
});
