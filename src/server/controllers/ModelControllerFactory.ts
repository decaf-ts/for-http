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
  const args: string[] = composed?.args?.length
    ? Array.from(new Set(composed.args))
    : [pk as string];

  if (!composed?.filterEmpty) {
    return [`:${args.join("/:")}`];
  }

  const canOmit = (name: string) =>
    composed.filterEmpty === true
      ? true
      : Array.isArray(composed.filterEmpty)
        ? composed.filterEmpty.includes(name)
        : false;

  const routes = new Set<string>();

  const walk = (index: number, current: string[]) => {
    if (index >= args.length) {
      if (current.length > 0) {
        routes.add(`:${current.join("/:")}`);
      }
      return;
    }

    const segment = args[index];
    const optional = canOmit(segment);

    current.push(segment);
    walk(index + 1, current);
    current.pop();

    if (optional) {
      walk(index + 1, current);
    }
  };

  walk(0, []);
  return [...routes];
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
