import { BaseModel, column, pk, query, route, table } from "@decaf-ts/core";
import { model, required, type ModelArg } from "@decaf-ts/decorator-validation";
import { ModelControllerBuilder } from "../../src/server/controllers/ModelControllerBuilder";
import { ModelControllerFactory } from "../../src/server/controllers/ModelControllerFactory";
import { Product } from "../../../for-nest/tests/unit/Product";
import { ProductMarket } from "../../../for-nest/tests/unit/ProductMarket";

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
      .addComplexQueries(persistence)
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
