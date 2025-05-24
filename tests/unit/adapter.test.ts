import { AxiosHttpAdapter } from "../../src/axios";
import { Axios } from "axios";
import { HttpAdapter } from "../../src";
import { HttpConfig } from "../../src";

const cfg: HttpConfig = {
  protocol: "http",
  host: "localhost:8080",
};

describe("Axios adapter", function () {
  let adapter: HttpAdapter<unknown, unknown>;

  beforeAll(function () {
    adapter = new AxiosHttpAdapter(new Axios(), cfg);
    expect(adapter).toBeDefined();
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
    const created = await adapter.create(tableName, id, record);
    expect(created).toBeDefined();
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith(
      `${cfg.protocol}://${cfg.host}/${tableName}`,
      record
    );
  });

  it("Properly invokes read", async function () {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getMock.mockImplementation(async (url: string) => {
      return Object.assign({}, record);
    });
    const read = await adapter.read(tableName, id);
    expect(read).toBeDefined();
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith(
      encodeURI(`${cfg.protocol}://${cfg.host}/${tableName}?id=${id}`)
    );
  });

  it("Properly invokes update", async function () {
    putMock.mockImplementation(
      async (url: string, data: Record<string, unknown>) => {
        return Object.assign({}, data);
      }
    );
    const updated = await adapter.update(tableName, id, record);
    expect(updated).toBeDefined();
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock).toHaveBeenCalledWith(
      `${cfg.protocol}://${cfg.host}/${tableName}`,
      record
    );
  });

  it("Properly invokes delete", async function () {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    deleteMock.mockImplementation(async (url: string) => {
      return Object.assign({}, record);
    });
    const deleted = await adapter.delete(tableName, id);
    expect(deleted).toBeDefined();
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledWith(
      encodeURI(`${cfg.protocol}://${cfg.host}/${tableName}?id=${id}`)
    );
  });
});
