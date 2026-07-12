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
import { Logger, Logging } from "@decaf-ts/logging";
import { Model } from "@decaf-ts/decorator-validation";

import { AUTH_NAMESPACE_KEY } from "./constants";
import type { AuthData, AuthRequestLike } from "./types";

export abstract class AuthHandler<
  EC = unknown,
  C extends Context = Context,
  D extends AuthData = AuthData,
> extends ContextualLoggedClass<C> {
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
   */
  protected bindLogger(log: Logger, request: AuthRequestLike, data: D): Logger {
    const meta: Record<string, unknown> = {};
    const ip = this.requestIpOf(request);
    const user = this.getUser(data);
    const organization = this.getOrganization(data);
    if (ip) meta.ip = ip;
    if (user) meta.user = user;
    if (organization) meta.organization = organization;
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
      `Authorizing access to ${typeof model === "string" ? model : model.name}`
    );

    const request = this.requestFromContext(context);
    if (this.isPublicRequest(request)) {
      log.debug(`Public request — skipping auth validation`);
      return;
    }

    const data = await this.prime(request, ctx);
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
