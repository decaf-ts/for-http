import { BaseModel, column, pk, query, route, table } from "@decaf-ts/core";
import { model, required, type ModelArg } from "@decaf-ts/decorator-validation";
import { composed, InternalError } from "@decaf-ts/db-decorators";
import { ModelControllerBuilder } from "../../src/server/controllers/ModelControllerBuilder";
import { ModelControllerFactory } from "../../src/server/controllers/ModelControllerFactory";
import { Product } from "./models/Product";
import { ProductMarket } from "./models/ProductMarket";

@table("factory_query_model")
@model()
class FactoryQueryModel extends BaseModel {
  @pk()
  id!: string;

  @required()
  @column()
  name!: string;

  constructor(arg?: ModelArg<FactoryQueryModel>) {
    super(arg);
  }
}

@table("factory_composed_model")
@model()
class FactoryComposedModel extends BaseModel {
  @pk()
  @composed(["code", "batchNumber", "locale"], ":", ["batchNumber", "locale"])
  id!: string;

  @required()
  @column()
  code!: string;

  @column()
  batchNumber?: string;

  @column()
  locale?: string;

  constructor(arg?: ModelArg<FactoryComposedModel>) {
    super(arg);
  }
}

class FactoryQueryRepository {
  class = FactoryQueryModel;

  @route("GET", "metadata/for-product/:productCode")
  createMetadata(body: FactoryQueryModel) {
    return body;
  }

  @query()
  findByName(name: string) {
    return name;
  }
}

function routesOf(controllerClass: any) {
  return ((controllerClass as any).__routes__ ?? [])
    .map((route: any) => ({
      method: route.method,
      path: route.path,
    }))
    .sort((a: any, b: any) =>
      `${a.method}:${a.path}`.localeCompare(`${b.method}:${b.path}`)
    );
}

describe("server/controllers/ModelControllerFactory", () => {
  it("defaults to the current for-nest route surface", () => {
    const persistence = new FactoryQueryRepository() as any;
    const factoryClass = ModelControllerFactory.create(
      FactoryQueryModel,
      persistence
    );
    const builderClass = new ModelControllerBuilder(
      FactoryQueryModel,
      persistence
    )
      .addCreateRoute()
      .addReadRoute()
      .addUpdateRoute()
      .addDeleteRoute()
      .addBulkCreateRoute()
      .addBulkReadRoute()
      .addBulkUpdateRoute()
      .addBulkDeleteRoute()
      .addStatementRoute()
      .addListByRoute()
      .addPaginateByRoute()
      .addFindRoute()
      .addPageRoute()
      .addFindOneByRoute()
      .addFindByRoute()
      .addComplexQueries(persistence)
      .addGroupingQueryRoute()
      .build();

    expect(routesOf(factoryClass)).toEqual(routesOf(builderClass));
  });

  it("removes statementless query routes when allowStatementlessQuery is false", () => {
    const persistence = new FactoryQueryRepository() as any;
    const factoryClass = ModelControllerFactory.create(
      FactoryQueryModel,
      persistence,
      { allowStatementlessQuery: false }
    );

    expect(routesOf(factoryClass)).toEqual(
      routesOf(
        new ModelControllerBuilder(FactoryQueryModel, persistence)
          .addCreateRoute()
          .addReadRoute()
          .addUpdateRoute()
          .addDeleteRoute()
          .addBulkCreateRoute()
          .addBulkReadRoute()
          .addBulkUpdateRoute()
          .addBulkDeleteRoute()
          .addStatementRoute()
          .addListByRoute()
          .addPaginateByRoute()
          .addFindRoute()
          .addPageRoute()
          .addFindOneByRoute()
          .addFindByRoute()
          .addGroupingQueryRoute()
          .build()
      )
    );
  });

  it("removes only the targeted bulk route for granular config", () => {
    const factoryClass = ModelControllerFactory.create(Product, undefined, {
      allowBulkStatement: { update: false },
    });
    const expectedClass = new ModelControllerBuilder(Product)
      .addCreateRoute()
      .addReadRoute()
      .addUpdateRoute()
      .addDeleteRoute()
      .addBulkCreateRoute()
      .addBulkReadRoute()
      .addBulkDeleteRoute()
      .addStatementRoute()
      .addListByRoute()
      .addPaginateByRoute()
      .addFindRoute()
      .addPageRoute()
      .addFindOneByRoute()
      .addFindByRoute()
      .addGroupingQueryRoute()
      .build();

    expect(routesOf(factoryClass)).toEqual(routesOf(expectedClass));
    expect(routesOf(factoryClass)).not.toContainEqual({
      method: "PUT",
      path: "bulk",
    });
  });

  it("adds composed-key fallback routes when filterEmpty allows trailing omission", () => {
    const factoryClass = ModelControllerFactory.create(ProductMarket);
    const routes = routesOf(factoryClass);

    expect(routes).toEqual(
      expect.arrayContaining([
        { method: "GET", path: ":productCode" },
        { method: "GET", path: ":productCode/:marketId" },
        { method: "PUT", path: ":productCode" },
        { method: "PUT", path: ":productCode/:marketId" },
        { method: "DELETE", path: ":productCode" },
        { method: "DELETE", path: ":productCode/:marketId" },
      ])
    );
  });

  it("adds every legal composed-key fallback route when filterEmpty omits middle segments", () => {
    const factoryClass = ModelControllerFactory.create(FactoryComposedModel);
    const routes = routesOf(factoryClass);
    const hasRoute = (method: string, path: string) =>
      routes.some((route) => route.method === method && route.path === path);

    for (const path of [
      ":code/:batchNumber/:locale",
      ":code/:batchNumber",
      ":code/:locale",
      ":code",
    ]) {
      expect(hasRoute("GET", path)).toBe(true);
      expect(hasRoute("PUT", path)).toBe(true);
      expect(hasRoute("DELETE", path)).toBe(true);
    }
  });

  it("respects granular grouping config objects", () => {
    const factoryClass = ModelControllerFactory.create(Product, undefined, {
      allowGroupingQueries: {
        count: false,
        group: true,
      },
    });
    const routes = routesOf(factoryClass);

    expect(routes).not.toContainEqual({ method: "GET", path: "countOf/:field" });
    expect(routes).toEqual(
      expect.arrayContaining([{ method: "GET", path: "groupOf/:field" }])
    );
  });

  it("does not register raw statement routes when persistence disables them", () => {
    const persistence = {
      class: FactoryQueryModel,
      _overrides: {
        allowRawStatements: false,
      },
      create() {
        return undefined;
      },
      read() {
        return undefined;
      },
      update() {
        return undefined;
      },
      delete() {
        return undefined;
      },
      createAll() {
        return undefined;
      },
      readAll() {
        return undefined;
      },
      updateAll() {
        return undefined;
      },
      deleteAll() {
        return undefined;
      },
      listBy() {
        return undefined;
      },
      paginateBy() {
        return undefined;
      },
      find() {
        return undefined;
      },
      page() {
        return undefined;
      },
      findOneBy() {
        return undefined;
      },
      findBy() {
        return undefined;
      },
    } as any;

    const factoryClass = ModelControllerFactory.create(
      FactoryQueryModel,
      persistence
    );
    const routes = routesOf(factoryClass);

    expect(routes).not.toContainEqual({
      method: "GET",
      path: "raw/:method/*args",
    });
  });

  it("fails closed instead of falling back to the raw statement API for direct routes", () => {
    const persistence = {
      class: FactoryQueryModel,
      statement() {
        return "statement";
      },
    } as any;

    const builder = new ModelControllerBuilder(FactoryQueryModel, persistence);
    const Controller = builder.addCreateRoute().build() as any;
    const route = Controller.__routes__[0];

    expect(() => route.implementation.call({ ctx: {} }, {})).toThrow(
      InternalError
    );
  });

  it("normalizes single bulk ids into arrays for read and delete routes", () => {
    const readAll = jest.fn();
    const deleteAll = jest.fn();
    const persistence = {
      class: FactoryQueryModel,
      readAll,
      deleteAll,
    } as any;

    const Controller = new ModelControllerBuilder(
      FactoryQueryModel,
      persistence
    )
      .addBulkReadRoute()
      .addBulkDeleteRoute()
      .build() as any;

    const bulkReadRoute = Controller.__routes__.find(
      (route: any) => route.method === "GET" && route.path === "bulk"
    );
    const bulkDeleteRoute = Controller.__routes__.find(
      (route: any) => route.method === "DELETE" && route.path === "bulk"
    );

    bulkReadRoute.implementation.call({ ctx: { requestId: "read" } }, "one-id");
    bulkDeleteRoute.implementation.call(
      { ctx: { requestId: "delete" } },
      "one-id"
    );

    expect(readAll).toHaveBeenCalledWith(["one-id"], { requestId: "read" });
    expect(deleteAll).toHaveBeenCalledWith(
      ["one-id"],
      { requestId: "delete" }
    );
  });
});
