import { AxiosHttpAdapter } from "../../src/axios";
import { HttpAdapter, HttpConfig, RestRepository } from "../../src";
import { Axios } from "axios";
import { pk } from "@decaf-ts/core";
import {
  model,
  Model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { toKebabCase } from "@decaf-ts/logging";

const cfg: HttpConfig = {
  protocol: "http",
  host: "localhost:8080",
};

@model()
class AggregationTestModel extends Model {
  @pk()
  id!: string;

  @required()
  name!: string;

  @required()
  score!: number;

  @required()
  category!: string;

  constructor(arg?: ModelArg<AggregationTestModel>) {
    super(arg);
  }
}

describe("RestRepository - Aggregation Methods URL Construction", () => {
  let adapter: HttpAdapter<any, any, any>;
  let repo: RestRepository<AggregationTestModel, any>;
  let requestMock: any;
  const table = toKebabCase(Model.tableName(AggregationTestModel));

  beforeAll(() => {
    adapter = new AxiosHttpAdapter(cfg);
    repo = new RestRepository(adapter, AggregationTestModel);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    requestMock = jest.spyOn(adapter.client as Axios, "request");
  });

  describe("countOf", () => {
    it("should construct correct URL for countOf without field", async () => {
      requestMock.mockImplementation(async () => ({
        status: 200,
        body: 10,
      }));

      const count = await repo.countOf();
      expect(count).toBe(10);
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining(`/${table}/statement/countOf`),
          method: "GET",
        })
      );
    });

    it("should construct correct URL for countOf with field", async () => {
      requestMock.mockImplementation(async () => ({
        status: 200,
        body: 8,
      }));

      const count = await repo.countOf("score" as any);
      expect(count).toBe(8);
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining(`/${table}/statement/countOf/score`),
          method: "GET",
        })
      );
    });
  });

  describe("maxOf", () => {
    it("should construct correct URL for maxOf", async () => {
      requestMock.mockImplementation(async () => ({
        status: 200,
        body: 100,
      }));

      const max = await repo.maxOf("score" as any);
      expect(max).toBe(100);
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining(`/${table}/statement/maxOf/score`),
          method: "GET",
        })
      );
    });
  });

  describe("minOf", () => {
    it("should construct correct URL for minOf", async () => {
      requestMock.mockImplementation(async () => ({
        status: 200,
        body: 5,
      }));

      const min = await repo.minOf("score" as any);
      expect(min).toBe(5);
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining(`/${table}/statement/minOf/score`),
          method: "GET",
        })
      );
    });
  });

  describe("avgOf", () => {
    it("should construct correct URL for avgOf", async () => {
      requestMock.mockImplementation(async () => ({
        status: 200,
        body: 42.5,
      }));

      const avg = await repo.avgOf("score" as any);
      expect(avg).toBe(42.5);
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining(`/${table}/statement/avgOf/score`),
          method: "GET",
        })
      );
    });
  });

  describe("sumOf", () => {
    it("should construct correct URL for sumOf", async () => {
      requestMock.mockImplementation(async () => ({
        status: 200,
        body: 500,
      }));

      const sum = await repo.sumOf("score" as any);
      expect(sum).toBe(500);
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining(`/${table}/statement/sumOf/score`),
          method: "GET",
        })
      );
    });
  });

  describe("distinctOf", () => {
    it("should construct correct URL for distinctOf", async () => {
      requestMock.mockImplementation(async () => ({
        status: 200,
        body: ["Electronics", "Books", "Clothing"],
      }));

      const distinct = await repo.distinctOf("category" as any);
      expect(distinct).toEqual(["Electronics", "Books", "Clothing"]);
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining(
            `/${table}/statement/distinctOf/category`
          ),
          method: "GET",
        })
      );
    });
  });

  describe("groupOf", () => {
    it("should construct correct URL for groupOf", async () => {
      const mockData = {
        Electronics: [
          { id: "1", name: "Item A", score: 10, category: "Electronics" },
          { id: "2", name: "Item B", score: 20, category: "Electronics" },
        ],
        Books: [{ id: "3", name: "Item C", score: 30, category: "Books" }],
      };

      requestMock.mockImplementation(async () => ({
        status: 200,
        body: mockData,
      }));

      const grouped = await repo.groupOf("category" as any);
      expect(Object.keys(grouped).sort()).toEqual(["Books", "Electronics"]);
      expect(grouped.Electronics).toHaveLength(2);
      expect(grouped.Books).toHaveLength(1);
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining(`/${table}/statement/groupOf/category`),
          method: "GET",
        })
      );
    });

    it("should parse grouped models correctly", async () => {
      const mockData = {
        Electronics: [
          { id: "1", name: "Item A", score: 10, category: "Electronics" },
        ],
      };

      requestMock.mockImplementation(async () => ({
        status: 200,
        body: mockData,
      }));

      const grouped = await repo.groupOf("category" as any);
      expect(grouped.Electronics[0]).toBeInstanceOf(AggregationTestModel);
      expect(grouped.Electronics[0].name).toBe("Item A");
    });
  });
});

describe("AxiosHttpAdapter - parseResponse for aggregations", () => {
  let adapter: HttpAdapter<any, any, any>;

  beforeAll(() => {
    // Reuse the adapter from global scope to avoid registration issues
    adapter = new AxiosHttpAdapter(cfg, "parseResponse-test");
  });

  it("should return primitive for countOf", () => {
    const result = (adapter as AxiosHttpAdapter).parseResponse(
      AggregationTestModel,
      "countOf",
      { status: 200, body: 42 }
    );
    expect(result).toBe(42);
  });

  it("should return primitive for maxOf", () => {
    const result = (adapter as AxiosHttpAdapter).parseResponse(
      AggregationTestModel,
      "maxOf",
      { status: 200, body: 100 }
    );
    expect(result).toBe(100);
  });

  it("should return primitive for minOf", () => {
    const result = (adapter as AxiosHttpAdapter).parseResponse(
      AggregationTestModel,
      "minOf",
      { status: 200, body: 1 }
    );
    expect(result).toBe(1);
  });

  it("should return primitive for avgOf", () => {
    const result = (adapter as AxiosHttpAdapter).parseResponse(
      AggregationTestModel,
      "avgOf",
      { status: 200, body: 35.5 }
    );
    expect(result).toBe(35.5);
  });

  it("should return primitive for sumOf", () => {
    const result = (adapter as AxiosHttpAdapter).parseResponse(
      AggregationTestModel,
      "sumOf",
      { status: 200, body: 500 }
    );
    expect(result).toBe(500);
  });

  it("should return array for distinctOf", () => {
    const result = (adapter as AxiosHttpAdapter).parseResponse(
      AggregationTestModel,
      "distinctOf",
      { status: 200, body: ["A", "B", "C"] }
    );
    expect(result).toEqual(["A", "B", "C"]);
  });

  it("should return parsed models for groupOf", () => {
    const mockBody = {
      Electronics: [
        { id: "1", name: "Item A", score: 10, category: "Electronics" },
      ],
      Books: [{ id: "2", name: "Item B", score: 20, category: "Books" }],
    };

    const result = (adapter as AxiosHttpAdapter).parseResponse(
      AggregationTestModel,
      "groupOf",
      { status: 200, body: mockBody }
    );

    expect(result.Electronics[0]).toBeInstanceOf(AggregationTestModel);
    expect(result.Books[0]).toBeInstanceOf(AggregationTestModel);
  });
});
