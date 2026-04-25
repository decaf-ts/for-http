import { HttpAdapter } from "../../src/adapter";
import { RestService } from "../../src/RestService";
import { ContextualArgs, UnsupportedError } from "@decaf-ts/core";
import {
  BaseError,
  Context,
  InternalError,
  OperationKeys,
  PrimaryKeyType,
} from "@decaf-ts/db-decorators";
import type { HttpConfig, HttpMethod, HttpRequestOptions } from "../../src/types";

class TestHttpAdapter extends HttpAdapter<HttpConfig, any, any> {
  parseResponse(_clazz: any, method: OperationKeys | string, res: any) {
    return res;
  }
  constructor(config: HttpConfig, alias?: string) {
    super(config, "test-http", alias);
  }

  toRequest(
    ctxOrQueryOrMethod: any,
    ctxOrUrl?: any,
    data?: unknown,
    options?: HttpRequestOptions
  ): any {
    if (typeof ctxOrQueryOrMethod === "string") {
      return {
        method: ctxOrQueryOrMethod as HttpMethod,
        url: ctxOrUrl,
        data,
        ...(options || {}),
      };
    }
    return {};
  }

  protected override getClient() {
    return {} as any;
  }
  override async request<V>(details: any): Promise<V> {
    return details as V;
  }
  // @ts-expect-error for test
  async create(
    tableName: string,
    id: PrimaryKeyType,
    model: Record<string, any>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: ContextualArgs<Context>
  ): Promise<Record<string, any>> {
    return { tableName, id, ...model };
  }
  // @ts-expect-error for test
  async read(
    tableName: string,
    id: PrimaryKeyType,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: ContextualArgs<Context>
  ): Promise<Record<string, any>> {
    return { tableName, id } as any;
  }
  // @ts-expect-error for test
  async update(
    tableName: string,
    id: PrimaryKeyType,
    model: Record<string, any>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: ContextualArgs<Context>
  ): Promise<Record<string, any>> {
    return { tableName, id, ...model };
  }
  // @ts-expect-error for test
  async delete(tableName: string, id: PrimaryKeyType, ...args: ContextualArgs<Context>): Promise<Record<string, any>>;
  async delete(url: string, options?: HttpRequestOptions): Promise<any>;
  async delete(
    tableNameOrUrl: string,
    idOrOptions?: PrimaryKeyType | HttpRequestOptions,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: ContextualArgs<Context>
  ): Promise<Record<string, any>> {
    if (
      typeof idOrOptions === "undefined" ||
      (typeof idOrOptions === "object" && !Array.isArray(idOrOptions))
    ) {
      return {
        code: 200,
        data: { method: "DELETE", url: tableNameOrUrl, ...(idOrOptions || {}) },
      };
    }
    return { tableName: tableNameOrUrl, id: idOrOptions } as any;
  }
  // expose protected url for testing
  public buildUrl(tableName: string, query?: Record<string, string | number>) {
    return super.url(tableName, query);
  }

  override parseError<E extends BaseError>(err: Error): E {
    return new InternalError(err.message) as E;
  }
}

describe("HttpAdapter base features", () => {
  const config: HttpConfig = { protocol: "https", host: "api.example.com" };
  let adapter: TestHttpAdapter;

  beforeEach(() => {
    adapter = new TestHttpAdapter(config, `test-${Math.random()}`);
  });

  test("repository() should return RestService constructor", () => {
    const RepoCtor = adapter.repository();
    expect(RepoCtor).toBe(RestService as any);
  });

  test("url() should build and encode URL with and without query params", () => {
    const base = adapter.buildUrl("users");
    expect(base).toBe("https://api.example.com/users");

    const withQuery = adapter.buildUrl("search", { q: "John Doe", page: 2 });
    expect(withQuery).toBe("https://api.example.com/search?q=John+Doe&page=2");
  });

  test("simple get/post/put/delete should delegate to request() with request options", async () => {
    const url = "https://api.example.com/v1/users";

    const getResult = await adapter.get(url, {
      timeout: 1000,
      includeCredentials: true,
    });
    expect(getResult.data).toEqual(
      expect.objectContaining({
        method: "GET",
        url,
        timeout: 1000,
        includeCredentials: true,
      })
    );

    const postResult = await adapter.post(
      url,
      { name: "Alice" },
      { headers: { "x-test": "1" } }
    );
    expect(postResult.data).toEqual(
      expect.objectContaining({
        method: "POST",
        url,
        data: { name: "Alice" },
      })
    );

    const putResult = await adapter.put(
      url,
      { name: "Bob" },
      { validateStatus: (status) => status < 500 }
    );
    expect(putResult.data).toEqual(
      expect.objectContaining({
        method: "PUT",
        url,
        data: { name: "Bob" },
      })
    );

    const deleteResult = await adapter.delete(url, {
      headers: { "x-delete": "1" },
    });
    expect(deleteResult.data).toEqual(
      expect.objectContaining({
        method: "DELETE",
        url,
      })
    );
  });

  test("parseError() should pass through errors as InternalError", () => {
    const err = new Error("boom");
    const parsed = adapter.parseError(err);
    expect(parsed.message).toBe(`[InternalError][500] ${err.message}`);
  });

  test("Sequence() should throw UnsupportedError", async () => {
    await expect(
      adapter.Sequence({
        startWith: 1,
        incrementBy: 1,
        type: "Number",
        cycle: false,
      })
    ).rejects.toBeInstanceOf(UnsupportedError);
  });

  test("parseCondition() should throw UnsupportedError", () => {
    expect(() => adapter.parseCondition({} as any)).toThrow(UnsupportedError);
  });
});
