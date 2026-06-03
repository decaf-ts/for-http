import {
  Adapter,
  Context,
  ContextOf,
  ContextualizedArgs,
  ContextualLoggedClass,
  FlagsOf,
  MaybeContextualArg,
  MethodOrOperation,
  ModelService,
  Repo,
  Repository,
  Service,
} from "@decaf-ts/core";
import { Logger } from "@decaf-ts/logging";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { Contextual } from "@decaf-ts/db-decorators";
import { Constructor } from "@decaf-ts/decoration";
import { RequestContext } from "./RequestContex";

export abstract class DecafController<
  REQUEST,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  RESPONSE,
  CONTEXT extends RequestContext<REQUEST>,
> extends Service<CONTEXT> {
  protected constructor(protected readonly ctx: RequestContext<REQUEST>) {
    super();
  }

  protected headersOf(request: REQUEST): Record<string, any> | undefined {
    return (request as any).headers || undefined;
  }

  protected ipOf(request: REQUEST): string | undefined {
    function parseIpHeader(value?: string | string[]): string | undefined {
      if (!value) return undefined;
      const candidate = Array.isArray(value) ? value[0] : value;
      return candidate
        .split(",")
        .map((segment) => segment.trim())
        .filter(Boolean)[0];
    }

    const headers = this.headersOf(request);
    if (headers) {
      const forwarded =
        parseIpHeader(headers?.["x-forwarded-for"]) ??
        parseIpHeader(headers?.["x-real-ip"]) ??
        parseIpHeader(headers?.["X-Forwarded-For"]) ??
        parseIpHeader(headers?.["X-Real-IP"]);
      if (forwarded) return forwarded;
    }

    return (request as any).ip || undefined;
  }

  protected loggerFor(log: Logger, request: REQUEST) {
    return log.for({ ip: this.ipOf(request) });
  }

  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD
  ): ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD,
    allowCreate: false,
    overrides?: Partial<FlagsOf<CONTEXT>>
  ): ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD,
    allowCreate: true,
    overrides?: Partial<FlagsOf<CONTEXT>>
  ): Promise<
    ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>
  >;
  protected override logCtx<
    CREATE extends boolean = false,
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD,
    allowCreate: CREATE = false as CREATE,
    overrides?: Partial<FlagsOf<CONTEXT>>
  ):
    | Promise<
        ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>
      >
    | ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false> {
    const ctx = this.ctx;
    args = args.filter((e) => typeof e !== "undefined");

    let request: REQUEST | undefined = undefined;
    if (overrides && (overrides.headers || (overrides as any).ip)) {
      request = overrides as any;
      overrides = {};
    }

    const result = ContextualLoggedClass.logCtx.call(
      this,
      operation,
      overrides || {},
      allowCreate,
      ...[...args, ctx]
    ) as any;
    return this.bindLoggerToRequest(result, request);
  }

  protected bindLoggerToRequest<RESULT extends ContextualizedArgs<any, any>>(
    value: RESULT | Promise<RESULT>,
    request?: REQUEST
  ): RESULT | Promise<RESULT> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    function applyRequestIp<RESULT extends ContextualizedArgs<any, any>>(
      ctxArgs: RESULT,
      request?: REQUEST
    ): RESULT {
      if (!request) return ctxArgs;
      ctxArgs.log = self.loggerFor(ctxArgs.log, request);
      return ctxArgs;
    }

    if (isPromise(value)) {
      return value.then((ctxArgs) => applyRequestIp(ctxArgs, request));
    }
    return applyRequestIp(value, request);
  }
}

export abstract class DecafModelController<
  M extends Model<boolean>,
  REQUEST,
  RESPONSE,
  CONTEXT extends RequestContext<REQUEST>,
> extends DecafController<REQUEST, RESPONSE, CONTEXT> {
  private _persistence?: Repo<M> | ModelService<M>;

  abstract get class(): ModelConstructor<M>;

  persistence(ctx: Context<any>): Repo<M> | ModelService<M> {
    if (!this._persistence)
      try {
        this._persistence = Service.get<ModelService<M>>(this.class);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e: unknown) {
        try {
          this._persistence = ModelService.getService(
            this.class
          ) as ModelService<M>;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e: unknown) {
          this._persistence = Repository.forModel(this.class) as Repo<M>;
        }
      }

    return this._persistence.override(ctx.toOverrides());
  }

  protected constructor() {
    super(undefined as any);
  }

  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<any, ARGS>,
    operation: METHOD
  ): ContextualizedArgs<
    ContextOf<ReturnType<this["persistence"]>>,
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<ReturnType<this["persistence"]>>, ARGS>,
    operation: METHOD,
    allowCreate: false,
    overrides?: Partial<FlagsOf<ContextOf<ReturnType<this["persistence"]>>>>
  ): ContextualizedArgs<
    ContextOf<ReturnType<this["persistence"]>>,
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<ReturnType<this["persistence"]>>, ARGS>,
    operation: METHOD,
    allowCreate: true,
    overrides?: Partial<FlagsOf<ContextOf<ReturnType<this["persistence"]>>>>
  ): Promise<
    ContextualizedArgs<
      ContextOf<ReturnType<this["persistence"]>>,
      ARGS,
      METHOD extends string ? true : false
    >
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<ReturnType<this["persistence"]>>, ARGS>,
    operation: METHOD,
    allowCreate: boolean = false,
    overrides?: Partial<FlagsOf<ContextOf<ReturnType<this["persistence"]>>>>
  ):
    | Promise<
        ContextualizedArgs<
          ContextOf<ReturnType<this["persistence"]>>,
          ARGS,
          METHOD extends string ? true : false
        >
      >
    | ContextualizedArgs<
        ContextOf<any>,
        ARGS,
        METHOD extends string ? true : false
      > {
    const ctx = this.ctx;

    let request: REQUEST | undefined = undefined;
    if (overrides && ((overrides as any).headers || (overrides as any).ip)) {
      request = overrides as any;
      overrides = {};
    }

    try {
      overrides = ctx.get("overrides") as any;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: unknown) {
      // do nothing
    }
    const persistence = this.persistence(ctx);
    let contextual: Contextual | undefined = undefined;
    if (persistence instanceof ModelService)
      contextual = persistence.repo["_adapter"];
    else if (persistence instanceof Repository)
      contextual = persistence["_adapter"];
    else if ((persistence as unknown as Contextual<any>).context) {
      contextual = persistence;
    }

    let ctxArgs: ContextualizedArgs<any>;

    if (!allowCreate) {
      ctxArgs = ((contextual as Adapter<any, any, any, any>)["logCtx"] as any)(
        args,
        operation,
        false,
        overrides
      );

      return this.bindLoggerToRequest(ctxArgs, request) as any;
    }

    return (
      ((contextual as Adapter<any, any, any, any>)["logCtx"] as any)(
        args,
        operation,
        true,
        overrides
      ) as unknown as Promise<ContextualizedArgs<any>>
    ).then((ctxArgs) => this.bindLoggerToRequest(ctxArgs, request)) as any;
  }
}

function isPromise(value: unknown): value is Promise<any> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Promise<any>).then === "function"
  );
}
