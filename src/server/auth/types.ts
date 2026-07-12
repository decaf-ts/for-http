/**
 * @module for-http/server/auth/types
 * @summary Framework-agnostic auth primitive types.
 * @description Shared structural type definitions for the base {@link AuthHandler} class.
 * Platform-specific types (e.g. NestJS `ExecutionContext`) are intentionally NOT defined
 * here — each platform narrows the base class generics with its own types.
 */

/**
 * Minimal representation of an incoming HTTP request as seen by an auth handler.
 *
 * Framework-specific request objects (Express `Request`, Fastify `FastifyRequest`, etc.)
 * satisfy this interface structurally.
 */
export interface AuthRequestLike {
  headers?: Record<string, unknown>;
  path?: string;
  method?: string;
  url?: string;
  [key: symbol | string]: unknown;
}

export interface UserData {
  /** Authenticated user identifier (email, username, subject, etc.). */
  user?: string;
  /** Roles granted to the user (from JWT, header, or other auth source). */
  roles?: string[];
  /** Namespace scopes granted to the user (from JWT, header, or other auth source). */
  namespaces?: string[];
}

/**
 * Auth data extracted from the request by {@link AuthHandler.extractFromRequest}.
 *
 * Concrete handlers may return a wider object — the extra fields can be bound to
 * the request context by overriding {@link AuthHandler.bindToContext}.
 */
export interface AuthData extends UserData {
  /** Organization / tenant / MSP the user belongs to. */
  organization?: string;
}
