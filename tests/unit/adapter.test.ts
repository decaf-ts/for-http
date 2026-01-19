import { AxiosHttpAdapter } from "../../src/axios";
import { Axios } from "axios";
import { HttpAdapter } from "../../src";
import { HttpConfig } from "../../src";
import { Context, pk } from "@decaf-ts/core";
import { Logging } from "@decaf-ts/logging";
import { Model, required } from "@decaf-ts/decorator-validation";
import { OperationKeys } from "@decaf-ts/db-decorators";

const cfg: HttpConfig = {
  protocol: "http",
  host: "localhost:8080",
};

describe("Axios adapter", function () {
  let adapter: HttpAdapter<any, any, any, any, any>;

  beforeAll(function () {
    adapter = new AxiosHttpAdapter(cfg);
    expect(adapter).toBeDefined();
  });

  let requestMock: any;

  beforeEach(function () {
    jest.clearAllMocks();
    jest.resetAllMocks();
    requestMock = jest.spyOn(adapter.client as Axios, "request");
  });

  class Test extends Model {
    @pk()
    id!: number;

    @required()
    name!: string;

    constructor() {
      super();
    }
  }

  const tableName: string = "test";
  const id: string = "id";
  const record = {
    id: id,
    name: "name",
  };

  it("Properly invokes create", async function () {
    requestMock.mockImplementation(async (details: any) => ({
      status: 200,
      body: {
        method: details.method,
        url: details.url,
        data: details.data,
      },
    }));
    const ctx = new Context().accumulate({
      logger: Logging.for(expect.getState().currentTestName),
      operation: OperationKeys.CREATE,
      affectedTables: [],
    });
    const created = await adapter.create(Test, id, record, ctx);
    expect(created).toBeDefined();
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `${cfg.protocol}://${cfg.host}/${tableName}/id`,
        method: "POST",
        data: expect.any(String),
      })
    );
  });

  it("Properly invokes read", async function () {
    requestMock.mockImplementation(async (details: any) => ({
      status: 200,
      body: {
        method: details.method,
        url: details.url,
      },
    }));
    const ctx = new Context().accumulate({ logger: Logging.get() });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const read = await adapter.read(Test, id, ctx);
    // expect(read).toBeDefined();
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: encodeURI(`${cfg.protocol}://${cfg.host}/${tableName}/${id}`),
        method: "GET",
      })
    );
  });

  it("Properly invokes update", async function () {
    requestMock.mockImplementation(async (details: any) => ({
      status: 200,
      body: {
        method: details.method,
        url: details.url,
        data: details.data,
      },
    }));
    const ctx = new Context().accumulate({ logger: Logging.get() });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const updated = await adapter.update(Test, id, record, ctx);
    // expect(updated).toBeDefined();
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `${cfg.protocol}://${cfg.host}/${tableName}/${id}`,
        method: "PUT",
        data: expect.stringContaining(`"name":"${record.name}"`),
      })
    );
  });

  it("Properly invokes delete", async function () {
    requestMock.mockImplementation(async (details: any) => ({
      status: 200,
      body: {
        method: details.method,
        url: details.url,
      },
    }));
    const ctx = new Context().accumulate({ logger: Logging.get() });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const deleted = await adapter.delete(Test, id, ctx);
    // expect(deleted).toBeDefined();
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: encodeURI(`${cfg.protocol}://${cfg.host}/${tableName}/${id}`),
        method: "DELETE",
      })
    );
  });
});
