import { AuthHandler, AuthData, AuthRequestLike } from "../../src/server/auth";
import {
  Context,
  AuthorizationError,
  type ContextualArgs,
} from "@decaf-ts/core";
import type { Constructor } from "@decaf-ts/decoration";

describe("server auth primitives", () => {
  describe("AuthRequestLike", () => {
    it("is satisfied structurally by a minimal request object", () => {
      const req: AuthRequestLike = {
        headers: { authorization: "Bearer token" },
        path: "/api",
        method: "GET",
      };
      expect(req.headers?.authorization).toBe("Bearer token");
      expect(req.path).toBe("/api");
    });
  });

  describe("AuthHandler", () => {
    it("can be extended with a custom execution context type", async () => {
      interface MyCtx {
        switchToHttp(): { getRequest(): AuthRequestLike };
      }

      class TestHandler extends AuthHandler<MyCtx, Context, AuthData> {
        protected requestFromContext(ctx: MyCtx): AuthRequestLike {
          return ctx.switchToHttp().getRequest();
        }

        protected override isPublicRequest(): boolean {
          return false;
        }

        protected extractFromRequest(request: AuthRequestLike): AuthData {
          const token = request.headers?.authorization as string;
          if (!token) throw new AuthorizationError("no token");
          return { user: token, roles: ["user"] };
        }

        protected override bindToContext(
          context: Context,
          data: AuthData
        ): void {
          context.accumulate({
            UUID: data.user,
            organization: data.organization,
          });
        }
      }

      const handler = new TestHandler();
      const ctx: MyCtx = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: "Bearer abc" },
            path: "/x",
            method: "GET",
          }),
        }),
      };

      const store: Record<string, unknown> = {};
      const context = new Context();
      (context as any).accumulate = (value: Record<string, unknown>) => {
        Object.assign(store, value);
        return context;
      };

      await handler.authorize(ctx, "Model", undefined, context);
      expect(store.UUID).toBe("Bearer abc");
    });

    it("can be extended with a minimal extractFromAuth", async () => {
      interface MyCtx {
        getRequest(): AuthRequestLike;
      }

      class MinimalHandler extends AuthHandler<MyCtx, Context, AuthData> {
        protected requestFromContext(ctx: MyCtx): AuthRequestLike {
          return ctx.getRequest();
        }

        protected override isPublicRequest(): boolean {
          return false;
        }

        protected extractFromRequest(request: AuthRequestLike): AuthData {
          if (!request.headers?.authorization)
            throw new AuthorizationError("no token");
          return { roles: ["user"] };
        }
      }

      const handler = new MinimalHandler();
      const ctx: MyCtx = {
        getRequest: () => ({
          headers: { authorization: "Bearer x" },
          path: "/",
          method: "GET",
        }),
      };

      const context = new Context();
      await handler.authorize(ctx, "Model", undefined, context);
    });

    it("checks requiredRoles passed before the context arg", async () => {
      interface MyCtx {
        getRoles(): string[];
      }

      class RoleHandler extends AuthHandler<MyCtx, Context, AuthData> {
        protected requestFromContext(ctx: MyCtx): AuthRequestLike {
          return { roles: ctx.getRoles() } as AuthRequestLike;
        }

        protected override isPublicRequest(): boolean {
          return false;
        }

        protected extractFromRequest(request: AuthRequestLike): AuthData {
          return { roles: (request as any).roles ?? [] };
        }
      }

      const handler = new RoleHandler();
      const ctx: MyCtx = { getRoles: () => ["reader"] };
      const context = new Context();

      await expect(
        handler.authorize(ctx, "Model", ["admin"], context)
      ).rejects.toThrow(AuthorizationError);

      await expect(
        handler.authorize(ctx, "Model", ["reader"], context)
      ).resolves.toBeUndefined();

      await expect(
        handler.authorize(ctx, "Model", undefined, context)
      ).resolves.toBeUndefined();
    });

    it("supports a custom AuthData generic with extra fields", async () => {
      interface MyCtx {
        getUserId(): string;
        getTenant(): string;
      }

      interface RichAuthData extends AuthData {
        tenant: string;
      }

      class RichBindHandler extends AuthHandler<MyCtx, Context, RichAuthData> {
        protected requestFromContext(ctx: MyCtx): AuthRequestLike {
          return {
            user: ctx.getUserId(),
            organization: ctx.getTenant(),
          } as AuthRequestLike;
        }

        protected override isPublicRequest(): boolean {
          return false;
        }

        protected extractFromRequest(request: AuthRequestLike): RichAuthData {
          return {
            user: request.user as string | undefined,
            roles: ["user"],
            tenant: request.organization as string,
          };
        }

        protected override bindToContext(
          context: Context,
          data: RichAuthData
        ): void {
          context.accumulate({
            UUID: data.user,
            organization: data.tenant,
          });
        }
      }

      const handler = new RichBindHandler();
      const ctx: MyCtx = {
        getUserId: () => "user123",
        getTenant: () => "acme",
      };
      const context = new Context();
      const store: Record<string, unknown> = {};
      (context as any).accumulate = (value: Record<string, unknown>) => {
        Object.assign(store, value);
        return context;
      };

      await handler.authorize(ctx, "Model", undefined, context);
      expect(store.UUID).toBe("user123");
      expect(store.organization).toBe("acme");
    });

    it("allows overriding validate for custom token validation", async () => {
      interface MyCtx {
        getToken(): string;
      }

      class ValidatingHandler extends AuthHandler<MyCtx, Context, AuthData> {
        protected requestFromContext(ctx: MyCtx): AuthRequestLike {
          return { user: ctx.getToken() } as AuthRequestLike;
        }

        protected override isPublicRequest(): boolean {
          return false;
        }

        protected extractFromRequest(request: AuthRequestLike): AuthData {
          return { user: request.user as string, roles: ["user"] };
        }

        protected override async validate(
          data: AuthData,
          routeRoles: string[] | undefined,
          routeNamespaces: string[] | undefined,
          skipModelNamespaces: boolean | undefined,
          model: string | Constructor,
          ...args: ContextualArgs<Context>
        ): Promise<void> {
          if (!data.user || data.user === "invalid")
            throw new AuthorizationError("Token rejected by custom validate");
          await super.validate(
            data,
            routeRoles,
            routeNamespaces,
            skipModelNamespaces,
            model,
            ...args
          );
        }
      }

      const handler = new ValidatingHandler();

      await expect(
        handler.authorize(
          { getToken: () => "invalid" },
          "Model",
          undefined,
          new Context()
        )
      ).rejects.toThrow("Token rejected");

      await expect(
        handler.authorize(
          { getToken: () => "valid" },
          "Model",
          undefined,
          new Context()
        )
      ).resolves.toBeUndefined();
    });

    it("binds parsed auth data before verification fails", async () => {
      interface MyCtx {
        getRequest(): AuthRequestLike;
      }

      class SplitHandler extends AuthHandler<MyCtx, Context, AuthData> {
        protected requestFromContext(ctx: MyCtx): AuthRequestLike {
          return ctx.getRequest();
        }

        protected override isPublicRequest(): boolean {
          return false;
        }

        protected override parseFromRequest(
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          _request: AuthRequestLike
        ): AuthData {
          return {
            user: "parsed-user",
            organization: "parsed-org",
            roles: ["user"],
          };
        }

        protected extractFromRequest(request: AuthRequestLike): AuthData {
          return this.parseFromRequest(request);
        }

        protected override async validateAuth(): Promise<void> {
          throw new AuthorizationError("signature rejected");
        }
      }

      const handler = new SplitHandler();
      const context = new Context();
      const store: Record<string, unknown> = {};
      (context as any).accumulate = (value: Record<string, unknown>) => {
        Object.assign(store, value);
        return context;
      };

      await expect(
        handler.authorize(
          {
            getRequest: () => ({
              headers: { authorization: "Bearer parsed-user" },
              path: "/",
              method: "GET",
            }),
          },
          "Model",
          undefined,
          context
        )
      ).rejects.toThrow("signature rejected");

      expect(store.user).toBe("parsed-user");
      expect(store.organization).toBe("parsed-org");
      expect(store.logger).toBeDefined();
    });

    it("checks requiredNamespaces passed before the context arg", async () => {
      interface MyCtx {
        getClaims(): { roles: string[]; namespaces: string[] };
      }

      class NamespaceHandler extends AuthHandler<MyCtx, Context, AuthData> {
        protected requestFromContext(ctx: MyCtx): AuthRequestLike {
          return {
            roles: ctx.getClaims().roles,
            namespaces: ctx.getClaims().namespaces,
          } as AuthRequestLike;
        }

        protected override isPublicRequest(): boolean {
          return false;
        }

        protected extractFromRequest(request: AuthRequestLike): AuthData {
          return {
            user: "namespace-user",
            roles: (request.roles as string[]) ?? [],
            namespaces: (request.namespaces as string[]) ?? [],
          };
        }
      }

      const handler = new NamespaceHandler();
      const ctx: MyCtx = {
        getClaims: () => ({
          roles: ["reader"],
          namespaces: ["tenant:alpha"],
        }),
      };
      const context = new Context();

      await expect(
        handler.authorize(
          ctx,
          "Model",
          undefined,
          ["tenant:beta"],
          false,
          context
        )
      ).rejects.toThrow("Missing required namespaces: tenant:beta");

      await expect(
        handler.authorize(
          ctx,
          "Model",
          undefined,
          ["tenant:alpha"],
          false,
          context
        )
      ).resolves.toBeUndefined();
    });

    it("can normalize role and namespace claims to a shared separator", async () => {
      interface MyCtx {
        getClaims(): string[];
      }

      class NormalizingHandler extends AuthHandler<MyCtx, Context, AuthData> {
        protected requestFromContext(ctx: MyCtx): AuthRequestLike {
          return { roles: ctx.getClaims() } as AuthRequestLike;
        }

        protected override isPublicRequest(): boolean {
          return false;
        }

        protected extractFromRequest(request: AuthRequestLike): AuthData {
          return {
            user: "normalized-user",
            roles: (request.roles as string[]) ?? [],
          };
        }

        protected override normalizeClaim(claim: string): string {
          return claim.replace(/-/g, ":");
        }
      }

      const handler = new NormalizingHandler();
      const context = new Context();

      await expect(
        handler.authorize(
          { getClaims: () => ["tenant-alpha"] },
          "Model",
          undefined,
          ["tenant:alpha"],
          false,
          context
        )
      ).resolves.toBeUndefined();
    });
  });
});
