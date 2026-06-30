import { BaseModel, column, pk, query, route, table } from "@decaf-ts/core";
import { model, required, type ModelArg } from "@decaf-ts/decorator-validation";
import { composed } from "@decaf-ts/db-decorators";
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
});
