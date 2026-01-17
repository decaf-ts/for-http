import { AxiosHttpAdapter } from "../../src/axios";
import { Axios } from "axios";
import { HttpAdapter } from "../../src";
import { HttpConfig } from "../../src";
import { Context, pk, PreparedStatementKeys } from "@decaf-ts/core";
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
    postMock.mockImplementation(
      async (url: string, data: Record<string, unknown>) => {
        return Object.assign({}, data);
      }
    );
    const ctx = new Context().accumulate({
      logger: Logging.for(expect.getState().currentTestName),
      operation: OperationKeys.CREATE,
      affectedTables: [],
    });
    const created = await adapter.create(Test, id, record, ctx);
    expect(created).toBeDefined();
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith(
      `${cfg.protocol}://${cfg.host}/${tableName}/id`,
      expect.objectContaining(record),
      expect.objectContaining({
        headers: expect.any(Object),
        logger: expect.any(Object),
      })
    );
  });

  it("Properly invokes read", async function () {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getMock.mockImplementation(async (url: string) => {
      return Object.assign({}, record);
    });
    const ctx = new Context().accumulate({ logger: Logging.get() });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const read = await adapter.read(Test, id, ctx);
    // expect(read).toBeDefined();
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith(
      encodeURI(`${cfg.protocol}://${cfg.host}/${tableName}/${id}`)
    );
  });

  it("Properly invokes update", async function () {
    putMock.mockImplementation(
      async (url: string, data: Record<string, unknown>) => {
        return Object.assign({}, data);
      }
    );
    const ctx = new Context().accumulate({ logger: Logging.get() });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const updated = await adapter.update(Test, id, record, ctx);
    // expect(updated).toBeDefined();
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock).toHaveBeenCalledWith(
      `${cfg.protocol}://${cfg.host}/${tableName}/${id}`,
      expect.objectContaining(record)
    );
  });

  it("Properly invokes delete", async function () {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    deleteMock.mockImplementation(async (url: string) => {
      return Object.assign({}, record);
    });
    const ctx = new Context().accumulate({ logger: Logging.get() });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const deleted = await adapter.delete(Test, id, ctx);
    // expect(deleted).toBeDefined();
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledWith(
      encodeURI(`${cfg.protocol}://${cfg.host}/${tableName}/${id}`)
    );
  });
});
