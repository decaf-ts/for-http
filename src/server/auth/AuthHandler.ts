/**
 * @module for-http/server/auth/AuthHandler
 * @summary Base server auth handler class.
 * @description The framework-agnostic authorization base class used by all Decaf server
 * integrations. Extends {@link ContextualLoggedClass} so concrete handlers can use
 * `logCtx` to retrieve the request context from the trailing `...args: ContextualArgs<C>`.
 *
 * Concrete handlers MUST override {@link AuthHandler.extractFromAuth} to pull auth data
 * (user, organization, roles) from the platform-specific execution context, and MUST
 * override {@link AuthHandler.bindToContext} to define how that data is bound to the
 * request context (e.g. accumulating `UUID` / `organization` for downstream
 * `@createdBy` / `@updatedBy` decorators).
 *
 * @typeParam EC - The platform execution context type (e.g. NestJS `ExecutionContext`).
 * @typeParam C - The request context type (extends {@link Context}).
 * @typeParam D - The auth-data shape returned by `extractFromAuth` and consumed by
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
import { Model } from "@decaf-ts/decorator-validation";

import type { AuthData, UserData } from "./types";

export abstract class AuthHandler<
  EC = unknown,
  C extends Context = Context,
  D extends UserData = AuthData,
> extends ContextualLoggedClass<C> {
  /**
   * Extracts auth data from the platform-specific execution context.
   *
   * Implementations MUST throw an `AuthorizationError` (or subclass) when the
   * request is unauthenticated.
   *
   * @param ctx - The execution context (e.g. NestJS `ExecutionContext`).
   * @returns The auth data to be checked against required/model roles and bound
   *   to the request context.
   */
  protected abstract extractFromAuth(ctx: EC): D | Promise<D>;

  /**
   * Binds extracted auth data to the request context.
   *
   * There is no default implementation — every concrete handler MUST define how
   * auth data reaches the persistence layer. A typical implementation accumulates
   * at least `UUID` (so `@createdBy` / `@updatedBy` decorators can read it) and
   * `organization` onto the context, and may also mutate the platform request
   * object to carry adapter-specific options.
   *
   * @param context - The request context (always the last arg of `authorize`).
   * @param data - The auth data returned by {@link extractFromAuth}.
   *   access to the platform request).
   */
  protected bindToContext(ctx: C, data: D) {
    ctx.accumulate(data);
  }

  /**
   * Authorizes an incoming request against a model resource.
   *
   * Orchestrates: context extraction (via `logCtx`) → auth data extraction
   * ({@link extractFromAuth}) → role checks (required + model-level) →
   * context binding ({@link bindToContext}).
   *
   * The request context is always the **last** argument via
   * `...args: ContextualArgs<C, [string[]?]>`, matching the Decaf convention.
   *
   * @param context - The platform execution context.
   * @param model - Model name or constructor being accessed.
   * @param args - `[requiredRoles?, context]` or `[context]`.
   */
  async authorize(
    context: EC,
    model: string | Constructor,
    requiredRoles: string[] | undefined,
    ...args: ContextualArgs<C, [string[]?]>
  ): Promise<void> {
    const { ctx, log, ctxArgs } = this.logCtx(args, this.authorize);
    log.debug(
      `Authorizing access to ${typeof model === "string" ? model : model.name}`
    );

    const data: D = await this.extractFromAuth(context);
    await this.validate(data, requiredRoles, model, ...ctxArgs);
    this.bindToContext(ctx, data);
    log.debug(`Authorization granted for user ${data.user ?? "unknown"}`);
  }

  protected async validate(
    data: D,
    routeRoles: string[] | undefined,
    model: string | Constructor,
    ...args: ContextualArgs<C>
  ) {
    const { log } = this.logCtx(args, this.validate);
    if (routeRoles && routeRoles.length) {
      log.silly(`validating route roles for ${data.user}`);
      this.validateRouteRoles(routeRoles, data);
    }

    const modelRoles = this.resolveModelRoles(model);
    if (modelRoles && modelRoles.length > 0) {
      log.silly(`validating model roles for ${data.user}`);
      this.validateModelRoles(modelRoles, data);
    }
  }

  protected validateRouteRoles(requiredRoles: string[], data: D) {
    const missing = requiredRoles.filter((r) => !data.roles?.includes(r));
    if (missing.length > 0) {
      throw new AuthorizationError(
        `Missing required roles: ${missing.join(", ")}`
      );
    }
  }

  protected validateModelRoles(modelRoles: string[], data: D) {
    const missing = modelRoles.filter((r) => !data.roles?.includes(r));
    if (missing.length > 0) {
      throw new AuthorizationError(
        `Missing required roles: ${missing.join(", ")}`
      );
    }
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
}
