import { HttpAdapter } from "../../src/adapter";
import { RestService } from "../../src/RestService";
import { UnsupportedError } from "@decaf-ts/core";
import { BaseError, Context, InternalError } from "@decaf-ts/db-decorators";
import type { HttpConfig, HttpFlags } from "../../src/types";
import { Model } from "@decaf-ts/decorator-validation";

class TestHttpAdapter extends HttpAdapter<
  HttpConfig,
  any,
  any,
  HttpFlags,
  Context<HttpFlags>
> {
  constructor(config: HttpConfig, alias?: string) {
    super(config, "test-http", alias);
  }
  protected override getClient() {
    return {} as any;
  }
  override async request<V>(details: any): Promise<V> {
    return details as V;
  }
  async create(
    tableName: string,
    id: string | number,
    model: Record<string, any>
  ): Promise<Record<string, any>> {
    return { tableName, id, ...model };
  }
  async read(
    tableName: string,
    id: string | number | bigint
  ): Promise<Record<string, any>> {
    return { tableName, id } as any;
  }
  async update(
    tableName: string,
    id: string | number,
    model: Record<string, any>
  ): Promise<Record<string, any>> {
    return { tableName, id, ...model };
  }
  async delete(
    tableName: string,
    id: string | number | bigint
  ): Promise<Record<string, any>> {
    return { tableName, id } as any;
  }
  // expose protected url for testing
  public buildUrl(tableName: string, query?: Record<string, string | number>) {
    return super.url(tableName, query);
  }

  override parseError(err: Error): BaseError {
    return new InternalError(err.message);
  }
}

describe("HttpAdapter base features", () => {
  const config: HttpConfig = { protocol: "https", host: "api.example.com" };
  let adapter: TestHttpAdapter;

  beforeEach(() => {
    adapter = new TestHttpAdapter(config, `test-${Math.random()}`);
  });

  test("repository() should return RestService constructor", () => {
    const RepoCtor = adapter.repository<Model>();
    expect(RepoCtor).toBe(RestService as any);
  });

  test("url() should build and encode URL with and without query params", () => {
    const base = adapter.buildUrl("users");
    expect(base).toBe("https://api.example.com/users");

    const withQuery = adapter.buildUrl("search", { q: "John Doe", page: 2 });
    expect(withQuery).toBe(
      "https://api.example.com/search?q=John%20Doe&page=2"
    );
  });

  test("parseError() should pass through errors as InternalError", () => {
    const err = new Error("boom");
    const parsed = adapter.parseError(err);
    expect(parsed.message).toBe(`[InternalError] ${err.message}`);
  });

  test("raw() should throw UnsupportedError", async () => {
    await expect(adapter.raw<any>({} as any, true)).rejects.toBeInstanceOf(
      UnsupportedError
    );
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

  test("Statement() should throw UnsupportedError", () => {
    expect(() => adapter.Statement<Model>()).toThrow(UnsupportedError);
  });

  test("parseCondition() should throw UnsupportedError", () => {
    expect(() => adapter.parseCondition({} as any)).toThrow(UnsupportedError);
  });
});
