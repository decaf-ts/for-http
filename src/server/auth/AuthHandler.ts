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

import type { AuthData } from "./types";

export abstract class AuthHandler<
  EC = unknown,
  C extends Context = Context,
  D extends AuthData = AuthData,
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
   * @param ctx - The execution context (optional, used by handlers that need
   *   access to the platform request).
   */
  protected abstract bindToContext(context: C, data: D, ctx?: EC): void;

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
   * @param ctx - The platform execution context.
   * @param model - Model name or constructor being accessed.
   * @param args - `[requiredRoles?, context]` or `[context]`.
   */
  async authorize(
    ctx: EC,
    model: string | Constructor,
    ...args: ContextualArgs<C, [string[]?]>
  ): Promise<void> {
    const { ctx: context, log, ctxArgs } = this.logCtx(args, this.authorize);

    const requiredRoles =
      ctxArgs.length > 1 ? (ctxArgs[0] as string[] | undefined) : undefined;

    log.debug(`Authorizing access to ${typeof model === "string" ? model : model.name}`);

    const data = await this.extractFromAuth(ctx);

    if (requiredRoles && requiredRoles.length > 0) {
      const missing = requiredRoles.filter((r) => !data.roles.includes(r));
      if (missing.length > 0) {
        throw new AuthorizationError(
          `Missing required roles: ${missing.join(", ")}`
        );
      }
    }

    const modelRoles = this.resolveModelRoles(model);
    if (modelRoles && modelRoles.length > 0) {
      const hasRole = modelRoles.some((r) => data.roles.includes(r));
      if (!hasRole) {
        throw new AuthorizationError(
          `User lacks any of the required model roles: ${modelRoles.join(", ")}`
        );
      }
    }

    this.bindToContext(context, data, ctx);
    log.debug(`Authorization granted for user ${data.user ?? "unknown"}`);
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
