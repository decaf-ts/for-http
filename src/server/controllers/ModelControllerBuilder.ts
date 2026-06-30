import { Model, type ModelConstructor } from "@decaf-ts/decorator-validation";
import { Metadata } from "@decaf-ts/decoration";
import {
  BulkCrudOperationKeys,
  DBKeys,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import {
  isOperationBlocked,
  ModelService,
  PersistenceKeys,
  PreparedStatementKeys,
  Repo,
  Repository,
  Service,
  UnsupportedError,
} from "@decaf-ts/core";
import { ServerControllerBuilder } from "./ControllerBuilder";
import { ServerMethodBuilder } from "./RouteBuilder";
import { ServerRoute } from "./models";
import type { GroupingQueryFlags } from "./types";

type PersistenceLike<T extends Model<boolean>> =
  | Repo<T>
  | ModelService<T>
  | Record<string, any>;

type RouteMetadata = Record<
  string,
  { path: string; httpMethod: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" }
>;

type QueryMetadata = Record<string, { fields?: string[] | undefined }>;

function allowsRawStatements(persistence: any): boolean {
  const candidates = [
    persistence,
    persistence?.repo,
    persistence?.repo?._adapter,
    persistence?._adapter,
  ];

  for (const candidate of candidates) {
    const allowed = candidate?._overrides?.allowRawStatements;
    if (typeof allowed === "boolean") return allowed;
  }

  return true;
}

function getPersistenceFallback<T extends Model<boolean>>(
  ModelConstr: ModelConstructor<T>
): Repo<T> | ModelService<T> {
  try {
    return Service.get<ModelService<T>>(ModelConstr);
  } catch {
    try {
      return ModelService.getService(ModelConstr) as ModelService<T>;
    } catch {
      return Repository.forModel(ModelConstr) as Repo<T>;
    }
  }
}

function metadataSource(value: any): any {
  if (!value) return value;
  return typeof value === "function" ? value : value.constructor;
}

function readRouteMetadata(value: any): RouteMetadata {
  const source = metadataSource(value);
  return (
    Metadata.get(source, Metadata.key(PersistenceKeys.DECAF_ROUTE)) ?? {}
  ) as RouteMetadata;
}

function readQueryMetadata(value: any): QueryMetadata {
  const source = metadataSource(value);
  return (
    Metadata.get(source, Metadata.key(PersistenceKeys.QUERY)) ?? {}
  ) as QueryMetadata;
}

function resolvePersistenceTarget<T extends Model<boolean>>(
  ModelConstr: ModelConstructor<T>,
  controllerThis: any,
  fallback?: PersistenceLike<T>
): any {
  if (controllerThis) {
    if (typeof controllerThis.persistence === "function") {
      try {
        return controllerThis.persistence(controllerThis.ctx);
      } catch {
        try {
          return controllerThis.persistence();
        } catch {
          // fall through to the builder fallback
        }
      }
    } else if (controllerThis.persistence) {
      return controllerThis.persistence;
    }
  }

  if (fallback) return fallback;
  return getPersistenceFallback(ModelConstr);
}

function invokeDirectPersistenceMethod(
  persistence: any,
  methodName: string,
  args: any[]
) {
  if (!persistence) {
    throw new InternalError(`No persistence available for method "${methodName}"`);
  }

  if (typeof persistence[methodName] === "function") {
    return persistence[methodName](...args);
  }

  if (persistence?.repo && typeof persistence.repo[methodName] === "function") {
    return persistence.repo[methodName](...args);
  }

  throw new InternalError(
    `Persistence method "${methodName}" not found on ${persistence?.constructor?.name ?? "unknown persistence"}`
  );
}

function invokeRepositoryPersistenceMethod(
  persistence: any,
  methodName: string,
  args: any[]
) {
  if (!persistence) {
    throw new InternalError(`No persistence available for method "${methodName}"`);
  }

  if (persistence?.repo && typeof persistence.repo[methodName] === "function") {
    return persistence.repo[methodName](...args);
  }

  if (typeof persistence[methodName] === "function") {
    return persistence[methodName](...args);
  }

  throw new InternalError(
    `Persistence method "${methodName}" not found on ${persistence?.constructor?.name ?? "unknown persistence"}`
  );
}

function invokeStatementPersistenceMethod(
  persistence: any,
  methodName: string,
  args: any[]
) {
  if (!allowsRawStatements(persistence)) {
    throw new UnsupportedError(
      `Raw statements are not allowed in the current configuration`
    );
  }

  if (!persistence) {
    throw new InternalError(`No persistence available for method "${methodName}"`);
  }

  if (typeof persistence.statement === "function") {
    return persistence.statement(methodName, ...args);
  }

  throw new InternalError(
    `Persistence method "${methodName}" not found on ${persistence?.constructor?.name ?? "unknown persistence"}`
  );
}

function normalizeQueryArgs(args: any[]): any[] {
  if (args.length === 0) return args;

  const normalized = [...args];
  const last = normalized[normalized.length - 1];
  if (!last || typeof last !== "object" || Array.isArray(last)) {
    return normalized;
  }

  const queryObj = last as Record<string, any>;
  const hasQueryFields =
    queryObj.direction !== undefined ||
    queryObj.limit !== undefined ||
    queryObj.offset !== undefined ||
    queryObj.bookmark !== undefined;

  if (!hasQueryFields) return normalized;

  normalized.pop();
  if (queryObj.direction !== undefined) normalized.push(queryObj.direction);
  if (queryObj.limit !== undefined) normalized.push(queryObj.limit);
  if (queryObj.offset !== undefined) normalized.push(queryObj.offset);
  if (queryObj.bookmark !== undefined) normalized.push(queryObj.bookmark);
  return normalized;
}

function modelRouteParameters<T extends Model<boolean>>(
  ModelConstr: ModelConstructor<T>
) {
  const pk = Model.pk(ModelConstr) as keyof Model<any>;
  const composed = Metadata.get(ModelConstr, Metadata.key(DBKeys.COMPOSED, pk));
  const composedKeys = composed?.args ?? [];
  const uniqueKeys =
    Array.isArray(composedKeys) && composedKeys.length > 0
      ? Array.from(new Set([...composedKeys]))
      : Array.from(new Set([pk as string]));

  return {
    pkName: pk as string,
    path: `:${uniqueKeys.join("/:")}`,
    getPK: (...params: Array<string | number>) =>
      composed?.separator ? params.join(composed.separator) : params.join(""),
  };
}

export class ModelControllerBuilder<T extends Model<boolean>, C = any> {
  private readonly controller: ServerControllerBuilder<C>;

  constructor(
    private readonly ModelConstr: ModelConstructor<T>,
    private readonly persistence?: PersistenceLike<T>
  ) {
    this.controller = new ServerControllerBuilder<C>();
  }

  withPrefix(prefix: string): this {
    this.controller.withPrefix(prefix);
    return this;
  }

  withPath(path: string): this {
    this.controller.withPath(path);
    return this;
  }

  withTags(tags: string[]): this {
    this.controller.withTags(tags);
    return this;
  }

  addCreateRoute(): this {
    if (isOperationBlocked(this.ModelConstr, OperationKeys.CREATE)) return this;
    const ModelConstr = this.ModelConstr;
    const fallback = this.persistence;

    this.controller.addMethodFromRoute(
      new ServerMethodBuilder()
        .withMethod("POST")
        .withPath("")
        .withImplementation(function create(this: any, data: T) {
          const persistence = resolvePersistenceTarget(ModelConstr, this, fallback);
          return invokeDirectPersistenceMethod(persistence, "create", [data, this?.ctx]);
        })
        .build()
    );
    return this;
  }

  addReadRoute(pathOverride?: string): this {
    if (isOperationBlocked(this.ModelConstr, OperationKeys.READ)) return this;
    const ModelConstr = this.ModelConstr;
    const fallback = this.persistence;
    const { path, getPK } = modelRouteParameters(ModelConstr);
    const routePath = pathOverride ?? path;

    this.controller.addMethodFromRoute(
      new ServerMethodBuilder()
        .withMethod("GET")
        .withPath(routePath)
        .withImplementation(function read(this: any, ...routeParams: Array<string | number>) {
          const persistence = resolvePersistenceTarget(ModelConstr, this, fallback);
          const id = getPK(...routeParams);
          return invokeDirectPersistenceMethod(persistence, "read", [id, this?.ctx]);
        })
        .build()
    );
    return this;
  }

  addUpdateRoute(pathOverride?: string): this {
    if (isOperationBlocked(this.ModelConstr, OperationKeys.UPDATE)) return this;
    const ModelConstr = this.ModelConstr;
    const fallback = this.persistence;
    const { path, getPK, pkName } = modelRouteParameters(ModelConstr);
    const routePath = pathOverride ?? path;

    this.controller.addMethodFromRoute(
      new ServerMethodBuilder()
        .withMethod("PUT")
        .withPath(routePath)
        .withImplementation(function update(
          this: any,
          body: T,
          ...routeParams: Array<string | number>
        ) {
          const persistence = resolvePersistenceTarget(ModelConstr, this, fallback);
          const id = getPK(...routeParams);
          const plainBody = JSON.parse(JSON.stringify(body));
          const payload = new ModelConstr({
            ...(plainBody as any),
            [pkName]: id,
          });
          return invokeDirectPersistenceMethod(persistence, "update", [payload, this?.ctx]);
        })
        .build()
    );
    return this;
  }

  addDeleteRoute(pathOverride?: string): this {
    if (isOperationBlocked(this.ModelConstr, OperationKeys.DELETE)) return this;
    const ModelConstr = this.ModelConstr;
    const fallback = this.persistence;
    const { path, getPK } = modelRouteParameters(ModelConstr);
    const routePath = pathOverride ?? path;

    this.controller.addMethodFromRoute(
      new ServerMethodBuilder()
        .withMethod("DELETE")
        .withPath(routePath)
        .withImplementation(function remove(
          this: any,
          ...routeParams: Array<string | number>
        ) {
          const persistence = resolvePersistenceTarget(ModelConstr, this, fallback);
          const id = getPK(...routeParams);
          return invokeDirectPersistenceMethod(persistence, "delete", [id, this?.ctx]);
        })
        .build()
    );
    return this;
  }

  addBulkCreateRoute(): this {
    if (isOperationBlocked(this.ModelConstr, "bulk", BulkCrudOperationKeys.CREATE_ALL))
      return this;
    const ModelConstr = this.ModelConstr;
    const fallback = this.persistence;

    this.controller.addMethodFromRoute(
      new ServerMethodBuilder()
        .withMethod("POST")
        .withPath("bulk")
        .withImplementation(function createAll(this: any, data: T[]) {
          const persistence = resolvePersistenceTarget(ModelConstr, this, fallback);
          return invokeDirectPersistenceMethod(persistence, "createAll", [data, this?.ctx]);
        })
        .build()
    );
    return this;
  }

  addBulkReadRoute(): this {
    if (isOperationBlocked(this.ModelConstr, "bulk", BulkCrudOperationKeys.READ_ALL))
      return this;
    const ModelConstr = this.ModelConstr;
    const fallback = this.persistence;

    this.controller.addMethodFromRoute(
      new ServerMethodBuilder()
        .withMethod("GET")
        .withPath("bulk")
        .withImplementation(function readAll(this: any, ids: string[]) {
          const persistence = resolvePersistenceTarget(ModelConstr, this, fallback);
          return invokeDirectPersistenceMethod(persistence, "readAll", [ids, this?.ctx]);
        })
        .build()
    );
    return this;
  }

  addBulkUpdateRoute(): this {
    if (isOperationBlocked(this.ModelConstr, "bulk", BulkCrudOperationKeys.UPDATE_ALL))
      return this;
    const ModelConstr = this.ModelConstr;
    const fallback = this.persistence;

    this.controller.addMethodFromRoute(
      new ServerMethodBuilder()
        .withMethod("PUT")
        .withPath("bulk")
        .withImplementation(function updateAll(this: any, data: T[]) {
          const persistence = resolvePersistenceTarget(ModelConstr, this, fallback);
          return invokeDirectPersistenceMethod(persistence, "updateAll", [data, this?.ctx]);
        })
        .build()
    );
    return this;
  }

  addBulkDeleteRoute(): this {
    if (isOperationBlocked(this.ModelConstr, "bulk", BulkCrudOperationKeys.DELETE_ALL))
      return this;
    const ModelConstr = this.ModelConstr;
    const fallback = this.persistence;

    this.controller.addMethodFromRoute(
      new ServerMethodBuilder()
        .withMethod("DELETE")
        .withPath("bulk")
        .withImplementation(function deleteAll(this: any, ids: string[]) {
          const persistence = resolvePersistenceTarget(ModelConstr, this, fallback);
          return invokeDirectPersistenceMethod(persistence, "deleteAll", [ids, this?.ctx]);
        })
        .build()
    );
    return this;
  }

  addStatementRoute(): this {
    if (!allowsRawStatements(this.persistence)) return this;
    if (isOperationBlocked(this.ModelConstr, "statement", PersistenceKeys.STATEMENT))
      return this;
    const ModelConstr = this.ModelConstr;
    const fallback = this.persistence;

    this.controller.addMethodFromRoute(
      new ServerMethodBuilder()
        .withMethod("GET")
        .withPath("statement/:method/*args")
        .withImplementation(function statement(
          this: any,
          method: string,
          args: Array<string | number>,
          details: {
            direction?: string;
            limit?: number;
            offset?: number;
            bookmark?: any;
          } = {}
        ) {
          const persistence = resolvePersistenceTarget(ModelConstr, this, fallback);
          args = args.map((arg) =>
            typeof arg === "string" ? (Number.isNaN(Number(arg)) ? arg : Number(arg)) : arg
          );
          const pathDirection = args.length > 1 ? args[1] : undefined;
          const resolvedDirection = (details.direction ?? pathDirection) as
            | string
            | undefined;
          if (resolvedDirection && args.length > 1) args[1] = resolvedDirection;

          switch (method) {
            case PreparedStatementKeys.FIND:
            case PreparedStatementKeys.FIND_BY:
              break;
            case PreparedStatementKeys.LIST_BY:
              args.push(details.direction as string);
              break;
            case PreparedStatementKeys.PAGE:
            case PreparedStatementKeys.PAGE_BY:
              args = [
                args[0],
                resolvedDirection as any,
                {
                  limit: details.limit,
                  offset: details.offset,
                  bookmark: details.bookmark,
                },
              ];
              break;
            case PreparedStatementKeys.FIND_ONE_BY:
              break;
            case PreparedStatementKeys.COUNT_OF:
            case PreparedStatementKeys.MAX_OF:
            case PreparedStatementKeys.MIN_OF:
            case PreparedStatementKeys.AVG_OF:
            case PreparedStatementKeys.SUM_OF:
            case PreparedStatementKeys.DISTINCT_OF:
            case PreparedStatementKeys.GROUP_OF:
              break;
          }

          return invokeStatementPersistenceMethod(persistence, "statement", [method, ...args, this?.ctx]);
        })
        .build()
    );
    return this;
  }

  addListByRoute(): this {
    if (isOperationBlocked(this.ModelConstr, "statement", PreparedStatementKeys.LIST_BY))
      return this;
    const ModelConstr = this.ModelConstr;
    const fallback = this.persistence;

    this.controller.addMethodFromRoute(
      new ServerMethodBuilder()
        .withMethod("GET")
        .withPath("listBy/:key")
        .withImplementation(function listBy(
          this: any,
          key: string,
          details: { direction?: string } = {}
        ) {
          const persistence = resolvePersistenceTarget(ModelConstr, this, fallback);
          return invokeDirectPersistenceMethod(persistence, "listBy", [
            key,
            details.direction,
            this?.ctx,
          ]);
        })
        .build()
    );
    return this;
  }

  addPaginateByRoute(): this {
    if (isOperationBlocked(this.ModelConstr, "statement", PreparedStatementKeys.PAGE_BY))
      return this;
    const ModelConstr = this.ModelConstr;
    const fallback = this.persistence;

    this.controller.addMethodFromRoute(
      new ServerMethodBuilder()
        .withMethod("GET")
        .withPath("paginateBy/:key/:page")
        .withImplementation(function paginateBy(
          this: any,
          key: string,
          page: string,
          details: { direction?: string; limit?: number; offset?: number } = {}
        ) {
          const persistence = resolvePersistenceTarget(ModelConstr, this, fallback);
          return invokeDirectPersistenceMethod(persistence, "paginateBy", [
            key,
            details.direction,
            { limit: details.limit, offset: details.offset, page },
            this?.ctx,
          ]);
        })
        .build()
    );
    return this;
  }

  addFindRoute(): this {
    if (isOperationBlocked(this.ModelConstr, "statement", PreparedStatementKeys.FIND))
      return this;
    const ModelConstr = this.ModelConstr;
    const fallback = this.persistence;

    this.controller.addMethodFromRoute(
      new ServerMethodBuilder()
        .withMethod("GET")
        .withPath("find/:value")
        .withImplementation(function find(
          this: any,
          value: string,
          details: { direction?: string } = {}
        ) {
          const persistence = resolvePersistenceTarget(ModelConstr, this, fallback);
          return invokeDirectPersistenceMethod(persistence, "find", [
            value,
            details.direction,
            this?.ctx,
          ]);
        })
        .build()
    );
    return this;
  }

  addPageRoute(): this {
    if (isOperationBlocked(this.ModelConstr, "statement", PreparedStatementKeys.PAGE))
      return this;
    const ModelConstr = this.ModelConstr;
    const fallback = this.persistence;

    this.controller.addMethodFromRoute(
      new ServerMethodBuilder()
        .withMethod("GET")
        .withPath("page/:value")
        .withImplementation(function page(
          this: any,
          value: string,
          details: {
            direction?: string;
            limit?: number;
            offset?: number;
            bookmark?: any;
          } = {}
        ) {
          const persistence = resolvePersistenceTarget(ModelConstr, this, fallback);
          const ref = {
            offset: details.offset ?? 1,
            limit: details.limit ?? 10,
            bookmark: details.bookmark,
          };
          return invokeDirectPersistenceMethod(persistence, "page", [
            value,
            details.direction ?? "ASC",
            ref,
            this?.ctx,
          ]);
        })
        .build()
    );
    return this;
  }

  addFindOneByRoute(): this {
    if (
      isOperationBlocked(
        this.ModelConstr,
        "statement",
        PreparedStatementKeys.FIND_ONE_BY
      )
    )
      return this;
    const ModelConstr = this.ModelConstr;
    const fallback = this.persistence;

    this.controller.addMethodFromRoute(
      new ServerMethodBuilder()
        .withMethod("GET")
        .withPath("findOneBy/:key/:value")
        .withImplementation(function findOneBy(
          this: any,
          key: string,
          value: any
        ) {
          const persistence = resolvePersistenceTarget(ModelConstr, this, fallback);
          return invokeDirectPersistenceMethod(persistence, "findOneBy", [
            key,
            value,
            this?.ctx,
          ]);
        })
        .build()
    );
    return this;
  }

  addFindByRoute(): this {
    if (isOperationBlocked(this.ModelConstr, "statement", PreparedStatementKeys.FIND_BY))
      return this;
    const ModelConstr = this.ModelConstr;
    const fallback = this.persistence;

    this.controller.addMethodFromRoute(
      new ServerMethodBuilder()
        .withMethod("GET")
        .withPath("findBy/:key/:value")
        .withImplementation(function findBy(this: any, key: string, value: any) {
          const persistence = resolvePersistenceTarget(ModelConstr, this, fallback);
          const target = persistence.for?.(this?.ctx?.toOverrides?.()) ?? persistence;
          return invokeDirectPersistenceMethod(target, "findBy", [key, value, this?.ctx]);
        })
        .build()
    );
    return this;
  }

  addGroupingQueryRoute(selection?: boolean | GroupingQueryFlags): this {
    const ModelConstr = this.ModelConstr;
    const fallback = this.persistence;
    const allow = (key: keyof GroupingQueryFlags) =>
      typeof selection === "boolean" ? selection : selection?.[key] ?? true;
    const routes: Array<[string, string]> = [
      [PreparedStatementKeys.COUNT_OF, "countOf/:field"],
      [PreparedStatementKeys.MAX_OF, "maxOf/:field"],
      [PreparedStatementKeys.MIN_OF, "minOf/:field"],
      [PreparedStatementKeys.AVG_OF, "avgOf/:field"],
      [PreparedStatementKeys.SUM_OF, "sumOf/:field"],
      [PreparedStatementKeys.DISTINCT_OF, "distinctOf/:field"],
      [PreparedStatementKeys.GROUP_OF, "groupOf/:field"],
    ];

    for (const [statementKey, path] of routes) {
      const selectionKey =
        statementKey === PreparedStatementKeys.COUNT_OF
          ? "count"
          : statementKey === PreparedStatementKeys.MAX_OF
            ? "max"
            : statementKey === PreparedStatementKeys.MIN_OF
              ? "min"
              : statementKey === PreparedStatementKeys.AVG_OF
                ? "avg"
                : statementKey === PreparedStatementKeys.SUM_OF
                  ? "sum"
                  : statementKey === PreparedStatementKeys.DISTINCT_OF
                    ? "distinct"
                    : "group";

      if (!allow(selectionKey as keyof GroupingQueryFlags)) continue;
      if (isOperationBlocked(ModelConstr, "statement", statementKey)) continue;

      this.controller.addMethodFromRoute(
        new ServerMethodBuilder()
          .withMethod("GET")
          .withPath(path)
          .withImplementation(function grouping(this: any, field: string) {
            const persistence = resolvePersistenceTarget(ModelConstr, this, fallback);
            return invokeStatementPersistenceMethod(persistence, "statement", [
              statementKey,
              field,
              this?.ctx,
            ]);
          })
          .build()
      );
    }

    return this;
  }

  addComplexQueryRoute(
    persistence: PersistenceLike<T>,
    methodName: string
  ): this {
    const queryMethods = readQueryMetadata(persistence);
    const methodMeta = queryMethods[methodName];
    if (!methodMeta) return this;
    if (isOperationBlocked(this.ModelConstr, "query", methodName)) return this;

    const fields = methodMeta.fields ?? [];
    const path = ["query", methodName, ...fields.map((field) => `:${field}`)]
      .filter(Boolean)
      .join("/");
    const ModelConstr = this.ModelConstr;

    this.controller.addMethodFromRoute(
      new ServerMethodBuilder()
        .withMethod("GET")
        .withPath(path)
        .withImplementation(function complexQuery(this: any, ...args: any[]) {
          const target = resolvePersistenceTarget(ModelConstr, this, persistence);
          const normalizedArgs = normalizeQueryArgs(args);
          return invokeRepositoryPersistenceMethod(target, methodName, normalizedArgs);
        })
        .build()
    );
    return this;
  }

  addComplexQueries(persistence?: PersistenceLike<T>): this {
    const source = persistence ?? this.persistence;
    if (!source) return this;

    const ModelConstr = this.ModelConstr;
    const routeMethods = readRouteMetadata(source);
    const queryMethods = readQueryMetadata(source);

    for (const [methodName, params] of Object.entries(routeMethods)) {
      if (isOperationBlocked(ModelConstr, "statement", methodName)) continue;

      this.controller.addMethodFromRoute(
        new ServerMethodBuilder()
          .withMethod(params.httpMethod)
          .withPath(params.path.replace(/^\/+|\/+$/g, ""))
          .withImplementation(function routedMethod(this: any, ...args: any[]) {
            const target = resolvePersistenceTarget(ModelConstr, this, source);
            return invokeRepositoryPersistenceMethod(target, methodName, args);
          })
          .build()
      );
    }

    for (const methodName of Object.keys(queryMethods)) {
      this.addComplexQueryRoute(source, methodName);
    }

    return this;
  }

  addMethodFromRoute(...route: ServerRoute[]): this {
    this.controller.addMethodFromRoute(...route);
    return this;
  }

  build(): C {
    return this.controller.build();
  }
}
