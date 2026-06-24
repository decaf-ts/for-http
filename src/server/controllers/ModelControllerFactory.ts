import { Model, type ModelConstructor } from "@decaf-ts/decorator-validation";
import { Metadata } from "@decaf-ts/decoration";
import { DBKeys } from "@decaf-ts/db-decorators";
import { type ModelControllerFactoryConfig } from "./types";
import { ModelControllerBuilder } from "./ModelControllerBuilder";

function bulkEnabled(
  config: ModelControllerFactoryConfig | undefined,
  key: "create" | "read" | "update" | "delete"
): boolean {
  const bulk = config?.allowBulkStatement;
  if (typeof bulk === "boolean") return bulk;
  if (!bulk) return true;
  return bulk[key] ?? true;
}

function groupingEnabled(
  config: ModelControllerFactoryConfig | undefined,
  key: "count" | "avg" | "max" | "min" | "sum" | "distinct" | "group"
): boolean {
  const grouping = config?.allowGroupingQueries;
  if (typeof grouping === "boolean") return grouping;
  if (!grouping) return false;
  return grouping[key] ?? true;
}

function composedRoutePaths<T extends Model<boolean>>(
  ModelConstr: ModelConstructor<T>
): string[] {
  const pk = Model.pk(ModelConstr) as keyof Model<any>;
  const composed = Metadata.get(ModelConstr, Metadata.key(DBKeys.COMPOSED, pk));
  const args: string[] = composed?.args?.length ? Array.from(new Set(composed.args)) : [pk as string];

  if (!composed?.filterEmpty) {
    return [`:${args.join("/:")}`];
  }

  const canOmit = (name: string) =>
    composed.filterEmpty === true
      ? true
      : Array.isArray(composed.filterEmpty)
        ? composed.filterEmpty.includes(name)
        : false;

  const routes: string[] = [];
  for (let end = args.length; end >= 1; end -= 1) {
    const omitted = args.slice(end);
    if (omitted.every(canOmit)) {
      routes.push(`:${args.slice(0, end).join("/:")}`);
    }
  }

  // Also generate a route with ALL filterEmpty fields removed (not just
  // trailing ones). This handles the case where filterEmpty fields are in
  // the middle of the composed PK (e.g. Leaflet's filterEmpty=["batchNumber",
  // "epiMarket"] where batchNumber is the 2nd of 5 args). The trailing-removal
  // loop above can only omit fields from the end, so we add this route to
  // cover the case where all filterEmpty fields are empty at once.
  const nonFilterEmpty = args.filter((a) => !canOmit(a));
  if (nonFilterEmpty.length > 0 && nonFilterEmpty.length < args.length) {
    routes.push(`:${nonFilterEmpty.join("/:")}`);
  }

  return Array.from(new Set(routes));
}

export class ModelControllerFactory {
  static create<T extends Model<boolean>, C = any>(
    ModelConstr: ModelConstructor<T>,
    persistence?: any,
    config?: ModelControllerFactoryConfig
  ): C {
    const builder = new ModelControllerBuilder<T, C>(ModelConstr, persistence);
    const allowStatementlessQuery = config?.allowStatementlessQuery ?? true;
    const allowGroupingQueries = config?.allowGroupingQueries ?? true;

    builder
      .addCreateRoute()
      .addReadRoute()
      .addUpdateRoute()
      .addDeleteRoute();

    if (bulkEnabled(config, "create")) builder.addBulkCreateRoute();
    if (bulkEnabled(config, "read")) builder.addBulkReadRoute();
    if (bulkEnabled(config, "update")) builder.addBulkUpdateRoute();
    if (bulkEnabled(config, "delete")) builder.addBulkDeleteRoute();

    builder.addStatementRoute();

    builder
      .addListByRoute()
      .addPaginateByRoute()
      .addFindRoute()
      .addPageRoute()
      .addFindOneByRoute()
      .addFindByRoute();

    if (allowStatementlessQuery) builder.addComplexQueries(persistence);

    if (allowGroupingQueries) {
      builder.addGroupingQueryRoute(
        typeof allowGroupingQueries === "boolean"
          ? allowGroupingQueries
          : {
              count: groupingEnabled(config, "count"),
              avg: groupingEnabled(config, "avg"),
              max: groupingEnabled(config, "max"),
              min: groupingEnabled(config, "min"),
              sum: groupingEnabled(config, "sum"),
              distinct: groupingEnabled(config, "distinct"),
              group: groupingEnabled(config, "group"),
            }
      );
    }

    const composedPaths = composedRoutePaths(ModelConstr);
    if (composedPaths.length > 1) {
      for (const path of composedPaths.slice(1)) {
        builder.addReadRoute(path).addUpdateRoute(path).addDeleteRoute(path);
      }
    }

    return builder.build();
  }
}
