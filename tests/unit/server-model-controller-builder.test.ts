import { BaseModel, column, pk, query, table } from "@decaf-ts/core";
import { model } from "@decaf-ts/decorator-validation";
import { ModelControllerBuilder } from "../../src/server/controllers/ModelControllerBuilder";
import { BlockOperations, OperationKeys, composed } from "@decaf-ts/db-decorators";
import { Repository } from "@decaf-ts/core";

@table("open_products")
@model()
class OpenProduct extends BaseModel {
  @pk()
  id!: string;

  @column()
  name!: string;
}

@table("blocked_products")
@model()
@BlockOperations([OperationKeys.DELETE])
class BlockedProduct extends BaseModel {
  @pk()
  id!: string;
}

@table("query_products")
@model()
class QueryProduct extends BaseModel {
  @pk()
  id!: string;
}

@table("composed_products")
@model()
class ComposedProduct extends BaseModel {
  @pk()
  @composed(["code", "marketId"], ":", true)
  id!: string;
}

class QueryProductRepository extends Repository<QueryProduct, any> {
  constructor() {
    super(undefined, QueryProduct);
  }

  @query()
  findByName(name: string): Promise<QueryProduct[]> {
    throw new Error(`Method not implemented: ${name}`);
  }
}

describe("server/controllers/ModelControllerBuilder", () => {
  it("registers the model route helpers when the model is not blocked", () => {
    const builder = new ModelControllerBuilder(OpenProduct);

    builder
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
      .addGroupingQueryRoute();

    const routes = (builder as any).controller.methods;

    expect(routes).toHaveLength(22);
    expect(routes.map((route: any) => route.path)).toEqual(
      expect.arrayContaining([
        "",
        ":id",
        "bulk",
        "statement/:method/*args",
        "listBy/:key",
        "paginateBy/:key/:page",
        "find/:value",
        "page/:value",
        "findOneBy/:key/:value",
        "findBy/:key/:value",
        "countOf/:field",
        "maxOf/:field",
        "minOf/:field",
        "avgOf/:field",
        "sumOf/:field",
        "distinctOf/:field",
        "groupOf/:field",
      ])
    );
  });

  it("omits a blocked CRUD route entirely", () => {
    const builder = new ModelControllerBuilder(BlockedProduct);

    builder.addDeleteRoute();

    const routes = (builder as any).controller.methods;
    expect(routes).toHaveLength(0);
  });

  it("derives complex query routes from repository metadata", () => {
    const builder = new ModelControllerBuilder(QueryProduct);

    builder.addComplexQueryRoute(QueryProductRepository as any, "findByName");

    const routes = (builder as any).controller.methods;
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe("GET");
    expect(routes[0].path).toBe("query/findByName/:name");
  });

  it("derives composed PK paths from composed metadata", () => {
    const builder = new ModelControllerBuilder(ComposedProduct);

    builder.addReadRoute().addUpdateRoute().addDeleteRoute();

    const routes = (builder as any).controller.methods;
    expect(routes).toHaveLength(3);
    expect(routes.map((route: any) => route.path)).toEqual([
      ":code/:marketId",
      ":code/:marketId",
      ":code/:marketId",
    ]);
  });
});
