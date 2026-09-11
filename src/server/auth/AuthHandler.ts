/**
 * @module for-http/server/auth/AuthHandler
 * @summary Base server auth handler class.
 * @description The framework-agnostic authorization base class used by all Decaf server
 * integrations. Extends {@link ContextualLoggedClass} so concrete handlers can use
 * `logCtx` to retrieve the request context from the trailing `...args: ContextualArgs<C>`.
 *
 * Concrete handlers MUST override {@link AuthHandler.requestFromContext} to pull the
 * request from the platform-specific execution context and MUST override
 * {@link AuthHandler.extractFromRequest} to translate that request into auth data.
 * Everything else is handled here so platform implementations only override the bits
 * that are actually provider-specific.
 *
 * @typeParam EC - The platform execution context type (e.g. NestJS `ExecutionContext`).
 * @typeParam C - The request context type (extends {@link Context}).
 * @typeParam D - The auth-data shape returned by `extractFromRequest` and consumed by
 *   `bindToContext`. Defaults to {@link AuthData}.
 */
import type { Constructor } from "@decaf-ts/decoration";
import { Metadata } from "@decaf-ts/decoration";
import {
  AuthorizationError,
  Context,
  ContextualArgs,
  ContextualLoggedClass,
  PersistenceKeys,
} from "@decaf-ts/core";
import { Logger, Logging, LogMeta } from "@decaf-ts/logging";
import { Model } from "@decaf-ts/decorator-validation";

import { AUTH_NAMESPACE_KEY } from "./constants";
import type { AuthData, AuthRequestLike } from "./types";

/**
 * OCSF action-log outcome values. The spec restricts these to a fixed set.
 */
export type AuthActionOutcome = "success" | "failure" | "error" | "unknown";

/**
 * OCSF event class uids used by the auth `logAccess` action logs.
 *
 * - `3001` — authentication class: auth attempt results (login success/failure).
 * - `3002` — account session class: session start/renewal/termination boundaries.
 */
export const AUTH_CLASS_UID_AUTHENTICATION = 3001;
export const AUTH_CLASS_UID_ACCOUNT_SESSION = 3002;

export abstract class AuthHandler<
  EC = unknown,
  C extends Context = Context,
  D extends AuthData = AuthData,
> extends ContextualLoggedClass<C> {
  /**
   * When enabled, the auth handler emits OCSF-style action logs (`action()`)
   * for login/logout and session boundaries so they can be indexed for BI.
   */
  public logAccess = false;

  /**
   * Resolves the request from the platform-specific execution context.
   *
   * @param ctx - The execution context (e.g. NestJS `ExecutionContext`).
   * @returns The request object inspected by {@link extractFromRequest}.
   */
  protected abstract requestFromContext(ctx: EC): AuthRequestLike;

  /**
   * Extracts auth data from an incoming request.
   *
   * Implementations MUST throw an `AuthorizationError` (or subclass) when the
   * request is unauthenticated.
   *
   * @param request - The platform request object.
   * @returns The auth data to be checked against required/model roles and bound
   *   to the request context.
   */
  protected abstract extractFromRequest(request: AuthRequestLike): D | Promise<D>;

  /**
   * Parses the request into auth data as early as possible.
   *
   * The default implementation preserves backward compatibility by delegating to
   * {@link extractFromRequest}. Provider-specific handlers can override this hook
   * when parsing and verification should be split so request metadata can be bound
   * before verification completes.
   */
  protected parseFromRequest(request: AuthRequestLike): D | Promise<D> {
    return this.extractFromRequest(request);
  }

  /**
   * Hook for provider-specific validation, such as JWT verification.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async validateAuth(_data: D, _request: AuthRequestLike): Promise<void> {}

  /**
   * Binds extracted auth data to the request context.
   */
  protected bindToContext(ctx: C, data: D) {
    ctx.accumulate(data);
  }

  /**
   * Returns the authenticated user identifier used for logger binding.
   */
  protected getUser(data: D): string | undefined {
    return data.user;
  }

  /**
   * Returns the authenticated organization/tenant used for logger binding.
   */
  protected getOrganization(data: D): string | undefined {
    return data.organization;
  }

  /**
   * Returns the roles granted to the authenticated principal.
   */
  protected getRoles(data: D): string[] {
    return data.roles ?? [];
  }

  /**
   * Returns the namespaces granted to the authenticated principal.
   */
  protected getNamespaces(data: D): string[] {
    return data.namespaces ?? [];
  }

  /**
   * Returns whether the request should skip auth processing entirely.
   */
  protected abstract isPublicRequest(request: AuthRequestLike): boolean;

  /**
   * Extracts the request IP from the common HTTP headers.
   */
  protected requestIpOf(request: AuthRequestLike): string | undefined {
    const headers = request.headers || {};
    const candidates = [
      headers["x-forwarded-for"],
      headers["x-real-ip"],
      headers["X-Forwarded-For"],
      headers["X-Real-IP"],
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate) {
        return candidate
          .split(",")
          .map((segment) => segment.trim())
          .filter(Boolean)[0];
      }
      if (Array.isArray(candidate) && typeof candidate[0] === "string") {
        return candidate[0]
          .split(",")
          .map((segment) => segment.trim())
          .filter(Boolean)[0];
      }
    }
    const ip = (request as any).ip;
    return typeof ip === "string" && ip ? ip : undefined;
  }

  /**
   * Returns a logger enriched with request-level auth metadata.
   *
   * Binds every property available at the earliest possible point — request IP,
   * user/tenant identification, and session metadata — so downstream logs (not
   * just the `logAccess` action log) carry the auth context. Server-related props
   * (`ip`) are registered in for-http/server; identity (`user`/`organization`)
   * and session enrichment are registered by the consuming integration.
   */
  protected bindLogger(log: Logger, request: AuthRequestLike, data: D): Logger {
    const meta: Record<string, unknown> = {};
    const ip = this.requestIpOf(request);
    const user = this.getUser(data);
    const organization = this.getOrganization(data);
    if (ip) meta.ip = ip;
    if (user) meta.user = user;
    if (organization) meta.organization = organization;
    const session = this.authSessionOf(data);
    if (session?.id) meta.sessionId = session.id;
    if (session?.type) meta.sessionType = session.type;
    return Object.keys(meta).length ? log.for(meta) : log;
  }

  /**
   * Binds the extracted auth data and logger metadata to the request context.
   */
  protected bindRequestContext(ctx: C, request: AuthRequestLike, data: D) {
    this.bindToContext(ctx, data);
    const currentLog =
      (ctx.getOrUndefined("logger" as any) as Logger | undefined) ??
      Logging.for(this as any);
    ctx.accumulate({
      logger: this.bindLogger(currentLog, request, data),
    } as any);
  }

  /**
   * Extracts auth data, optionally binding it to the supplied context.
   */
  async inspect(request: AuthRequestLike, ctx?: C): Promise<D> {
    const data = await this.parseFromRequest(request);
    if (ctx) {
      this.bindRequestContext(ctx, request, data);
    }
    return data;
  }

  /**
   * Priming hook intended for early middleware.
   */
  async prime(request: AuthRequestLike, ctx: C): Promise<D> {
    return this.inspect(request, ctx);
  }

  /**
   * Authorizes an incoming request against a model resource.
   *
   * Orchestrates: context extraction (via `logCtx`) → auth data extraction
   * ({@link extractFromRequest}) → role checks (required + model-level) →
   * context binding ({@link bindToContext}).
   *
   * The request context is always the **last** argument via
   * `...args: ContextualArgs<C, [string[]?]>`, matching the Decaf convention.
   *
   * @param context - The platform execution context.
   * @param model - Model name or constructor being accessed.
   * @param args - `[requiredRoles?, context]`, or with namespace support:
   *   `[requiredRoles?, requiredNamespaces?, skipModelNamespaces?, context]`.
   */
  async authorize(
    context: EC,
    model: string | Constructor,
    requiredRoles: string[] | undefined,
    requiredNamespacesOrArgs?: string[] | C | ContextualArgs<C, [string[]?]>,
    skipModelNamespacesOrArgs?: boolean | C | ContextualArgs<C, [string[]?]>,
    ...args: ContextualArgs<C, [string[]?]>
  ): Promise<void> {
    const hasRouteNamespaces =
      Array.isArray(requiredNamespacesOrArgs) &&
      typeof requiredNamespacesOrArgs[requiredNamespacesOrArgs.length - 1] !==
        "object";
    const requiredNamespaces = hasRouteNamespaces
      ? (requiredNamespacesOrArgs as string[])
      : undefined;
    const skipModelNamespaces =
      typeof skipModelNamespacesOrArgs === "boolean"
        ? skipModelNamespacesOrArgs
        : false;
    const ctxArgs = hasRouteNamespaces
      ? args
      : ([
          ...(requiredNamespacesOrArgs ? [requiredNamespacesOrArgs] : []),
          ...(Array.isArray(skipModelNamespacesOrArgs)
            ? skipModelNamespacesOrArgs
            : []),
          ...args,
        ] as ContextualArgs<C, [string[]?]>);
    const { ctx, log } = this.logCtx(ctxArgs, this.authorize);
    log.debug(
      `Authorizing access to ${typeof model === "string" ? model : (model?.name ?? "route without model")}`
    );

    const request = this.requestFromContext(context);
    if (this.isPublicRequest(request)) {
      log.debug(`Public request — skipping auth validation`);
      return;
    }

    let data: D | undefined;
    const started = Date.now();
    try {
      data = await this.prime(request, ctx);
      await this.validateAuth(data, request);
      await this.validate(
        data,
        requiredRoles,
        requiredNamespaces,
        skipModelNamespaces,
        model,
        ...ctxArgs
      );
      log.debug(`Authorization granted for user ${data.user ?? "unknown"}`);
      if (this.logAccess) {
        this.emitAuthAction(
          log,
          "user_login",
          AUTH_CLASS_UID_AUTHENTICATION,
          this.buildAuthActionMeta({
            name: "user_login",
            outcome: "success",
            durationMs: Date.now() - started,
            data,
            operation: ctx.getOrUndefined("operation" as any),
          })
        );
      }
    } catch (error) {
      log.debug(
        `Authorization denied for user ${data?.user ?? "unknown"}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Auth failures are always action-logged for auditing, regardless of the
      // opt-in `logAccess` flag that gates the (higher-volume) success path.
      this.emitAuthAction(
        log,
        "user_login",
        AUTH_CLASS_UID_AUTHENTICATION,
        this.buildAuthActionMeta({
          name: "user_login",
          outcome: this.ocsfOutcomeOf(error),
          durationMs: Date.now() - started,
          data,
          operation: ctx.getOrUndefined("operation" as any),
        })
      );
      throw error;
    }
  }

  /**
   * Maps an auth error to one of the OCSF outcomes.
   *
   * Decaf auth failures (an {@link AuthorizationError} or subclass) map to
   * `failure`; any other unexpected error maps to `error`. `success`/`unknown`
   * are reserved for the no-error / indeterminate cases.
   */
  protected ocsfOutcomeOf(error: unknown): AuthActionOutcome {
    if (!error) return "success";
    if (error instanceof AuthorizationError) return "failure";
    const name =
      (error as { name?: string })?.name ?? (error as any)?.constructor?.name;
    if (name && /auth|token|credential|unauthorized/i.test(name)) {
      return "failure";
    }
    return "error";
  }

  /**
   * Builds the OCSF session metadata for auth action logs.
   *
   * Providers can override to surface a session id (e.g. from a JWT `sid`
   * claim). The default provides an interactive-session type with no id.
   */
  protected authSessionOf(data?: D): { id?: string; type?: string } | undefined {
    void data;
    return { type: "bi_interactive_session" };
  }

  /**
   * Builds the auth action custom-property payload.
   *
   * Unlike the previous structured record, the OCSF auth fields are flattened
   * into logger custom properties. `class_uid` becomes the `action()` call's
   * `code` argument, so it is NOT carried here. `error_code` is already emitted
   * via the logger's error path (`errorCode`) and `actor.user` is already bound
   * by the auth handler on decode, so neither is duplicated here.
   */
  protected buildAuthActionMeta(
    params: {
      name: string;
      outcome: AuthActionOutcome;
      durationMs?: number;
      data?: D;
      operation?: string;
    }
  ): LogMeta {
    const meta: LogMeta = { name: params.name, outcome: params.outcome };
    if (params.durationMs !== undefined) {
      meta.duration_ms = params.durationMs;
    }
    if (params.operation !== undefined) {
      meta.operation = params.operation;
    }
    const session = this.authSessionOf(params.data);
    if (session?.id) meta.sessionId = session.id;
    if (session?.type) meta.sessionType = session.type;
    return meta;
  }

  /**
   * Emits an OCSF action log via the logger `action()` API. The `classUid`
   * becomes the `code` argument; the remaining auth fields are carried as meta
   * (this API carries no message - the action name and meta are the payload).
   */
  protected emitAuthAction(
    log: Logger,
    name: string,
    classUid: number,
    meta: LogMeta
  ): void {
    log.action(name, classUid, meta);
  }

  /**
   * Emits a session-boundary action log (OCSF class_uid 3002), e.g. on logout
   * or session termination. When `log` is omitted the handler's own logger is
   * used.
   */
  public logAccessSessionEvent(
    log: Logger | undefined,
    params: {
      name: string;
      outcome?: AuthActionOutcome;
      user?: string;
      sessionId?: string;
      durationMs?: number;
    }
  ): void {
    const meta: LogMeta = {
      name: params.name,
      outcome: params.outcome ?? "success",
      sessionType: "bi_interactive_session",
    };
    if (params.sessionId !== undefined) {
      meta.sessionId = params.sessionId;
    }
    if (params.durationMs !== undefined) {
      meta.duration_ms = params.durationMs;
    }
    if (params.user) meta.user = params.user;
    this.emitAuthAction(
      log ?? Logging.for(this as any),
      params.name,
      AUTH_CLASS_UID_ACCOUNT_SESSION,
      meta
    );
  }

  protected async validate(
    data: D,
    routeRoles: string[] | undefined,
    routeNamespaces: string[] | undefined,
    skipModelNamespaces: boolean | undefined,
    model: string | Constructor,
    ...args: ContextualArgs<C>
  ) {
    const { log } = this.logCtx(args, this.validate);
    if (routeRoles && routeRoles.length) {
      log.silly(`validating route roles for ${data.user}`);
      this.validateRouteRoles(routeRoles, data);
    }

    if (routeNamespaces && routeNamespaces.length) {
      log.silly(`validating route namespaces for ${data.user}`);
      this.validateRouteNamespaces(routeNamespaces, data);
    }

    const modelRoles = this.resolveModelRoles(model);
    if (modelRoles && modelRoles.length > 0) {
      log.silly(`validating model roles for ${data.user}`);
      this.validateModelRoles(modelRoles, data);
    }

    const modelNamespaces = skipModelNamespaces
      ? undefined
      : this.resolveModelNamespaces(model);
    if (modelNamespaces && modelNamespaces.length > 0) {
      log.silly(`validating model namespaces for ${data.user}`);
      this.validateModelNamespaces(modelNamespaces, data);
    }
  }

  protected validateRouteRoles(requiredRoles: string[], data: D) {
    const missing = this.findMissingClaims(requiredRoles, data);
    if (missing.length > 0) {
      throw new AuthorizationError(
        `Missing required roles: ${missing.join(", ")}`
      );
    }
  }

  protected validateRouteNamespaces(requiredNamespaces: string[], data: D) {
    const missing = this.findMissingClaims(requiredNamespaces, data);
    if (missing.length > 0) {
      throw new AuthorizationError(
        `Missing required namespaces: ${missing.join(", ")}`
      );
    }
  }

  protected validateModelRoles(modelRoles: string[], data: D) {
    const missing = this.findMissingClaims(modelRoles, data);
    if (missing.length > 0) {
      throw new AuthorizationError(
        `Missing required roles: ${missing.join(", ")}`
      );
    }
  }

  protected validateModelNamespaces(modelNamespaces: string[], data: D) {
    const missing = this.findMissingClaims(modelNamespaces, data);
    if (missing.length > 0) {
      throw new AuthorizationError(
        `Missing required namespaces: ${missing.join(", ")}`
      );
    }
  }

  protected findMissingClaims(required: string[], data: D): string[] {
    const granted = new Set<string>(
      this.getGrantedClaims(data).map((claim) => this.normalizeClaim(claim))
    );
    return required
      .map((claim) => this.normalizeClaim(claim))
      .filter((claim) => !granted.has(claim));
  }

  /**
   * Returns the complete set of granted claims for comparison.
   *
   * Roles and namespaces are intentionally treated as the same auth surface here;
   * provider-specific handlers can normalize the strings to a common shape.
   */
  protected getGrantedClaims(data: D): string[] {
    return [...this.getRoles(data), ...this.getNamespaces(data)];
  }

  /**
   * Normalizes a claim before comparison.
   *
   * Override this in provider-specific handlers when the source uses a different
   * separator or naming convention than the request-side namespace API.
   */
  protected normalizeClaim(claim: string): string {
    return claim;
  }

  /**
   * Resolves model-level roles from the `@roles()` class decorator metadata.
   */
  protected resolveModelRoles(
    model: string | Constructor
  ): string[] | undefined {
    if (!model) return undefined;
    const ctor =
      typeof model === "string" ? Model.get(model) : (model as Constructor);
    if (!ctor) return undefined;
    return Metadata.get(ctor, PersistenceKeys.AUTH_ROLE);
  }

  /**
   * Resolves model-level namespaces from the `@namespace()` class decorator metadata.
   */
  protected resolveModelNamespaces(
    model: string | Constructor
  ): string[] | undefined {
    if (!model) return undefined;
    const ctor =
      typeof model === "string" ? Model.get(model) : (model as Constructor);
    if (!ctor) return undefined;
    return Metadata.get(ctor, AUTH_NAMESPACE_KEY);
  }
}
