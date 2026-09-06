import {
  AuthActionOutcome,
  AUTH_CLASS_UID_ACCOUNT_SESSION,
  AUTH_CLASS_UID_AUTHENTICATION,
  AuthHandler,
  AuthData,
  AuthRequestLike,
} from "../../src/server/auth";
import { Context, AuthorizationError, ForbiddenError } from "@decaf-ts/core";
import type { Logger, LogMeta } from "@decaf-ts/logging";

interface MyCtx {
  request: AuthRequestLike;
}

type CapturedAction = {
  name: string;
  classUid: number;
  meta: LogMeta;
};

/**
 * Concrete handler that lets the OCSF logAccess tests drive behavior and
 * capture the custom-property payloads passed to the logger's `action()` API.
 */
class TestAuthHandler extends AuthHandler<MyCtx, Context, AuthData> {
  public actions: CapturedAction[] = [];
  public captureActions = true;
  public publicRequest = false;
  public requestValue: AuthRequestLike = {
    headers: { authorization: "Bearer abc" },
    path: "/x",
    method: "GET",
  };
  public authData: AuthData = { user: "alice", roles: ["user"] };
  public extractError: Error | undefined;
  public sessionIdOverride: string | undefined;

  protected requestFromContext(ctx: MyCtx): AuthRequestLike {
    return ctx.request ?? this.requestValue;
  }

  protected override isPublicRequest(): boolean {
    return this.publicRequest;
  }

  protected extractFromRequest(request: AuthRequestLike): AuthData {
    void request;
    if (this.extractError) throw this.extractError;
    return { ...this.authData };
  }

  protected override emitAuthAction(
    log: Logger,
    name: string,
    classUid: number,
    meta: LogMeta
  ): void {
    if (this.captureActions) {
      this.actions.push({ name, classUid, meta });
    } else {
      super.emitAuthAction(log, name, classUid, meta);
    }
  }

  protected override authSessionOf(
    data?: AuthData
  ): { id?: string; type?: string } | undefined {
    void data;
    return this.sessionIdOverride
      ? { id: this.sessionIdOverride, type: "bi_interactive_session" }
      : { type: "bi_interactive_session" };
  }

  public exposeOcsfOutcomeOf(error: unknown): AuthActionOutcome {
    return this.ocsfOutcomeOf(error);
  }

  public exposeBuildAuthActionMeta(params: {
    name: string;
    outcome: AuthActionOutcome;
    durationMs?: number;
    data?: AuthData;
  }): LogMeta {
    return this.buildAuthActionMeta(params);
  }
}

const OUTCOMES: AuthActionOutcome[] = [
  "success",
  "failure",
  "error",
  "unknown",
];

describe("AuthHandler OCSF logAccess", () => {
  const runAuthorize = async (handler: TestAuthHandler) => {
    const context = new Context();
    await handler.authorize(
      { request: handler.requestValue } as MyCtx,
      "Model",
      undefined,
      context
    );
    return context;
  };

  describe("logAccess default", () => {
    it("defaults to false", () => {
      const handler = new TestAuthHandler();
      expect(handler.logAccess).toBe(false);
    });

    it("emits no action log when logAccess is false", async () => {
      const handler = new TestAuthHandler();
      handler.logAccess = false;
      await runAuthorize(handler);
      expect(handler.actions).toHaveLength(0);
    });
  });

  describe("authorize success", () => {
    it("emits a user_login success custom-property payload when logAccess is true", async () => {
      const handler = new TestAuthHandler();
      handler.logAccess = true;
      await runAuthorize(handler);
      expect(handler.actions).toHaveLength(1);
      const { name, classUid, meta } = handler.actions[0];
      expect(name).toBe("user_login");
      expect(classUid).toBe(AUTH_CLASS_UID_AUTHENTICATION);
      expect(meta).toMatchObject({
        name: "user_login",
        outcome: "success",
      });
      expect(typeof meta.duration_ms).toBe("number");
      expect(meta.sessionType).toBe("bi_interactive_session");
      expect(meta.category).toBeUndefined();
      expect(meta.user).toBeUndefined();
    });
  });

  describe("authorize failure", () => {
    it("re-throws and emits user_login failure (no error_code duplicate) when extractFromRequest throws AuthorizationError", async () => {
      const handler = new TestAuthHandler();
      handler.logAccess = true;
      handler.extractError = new AuthorizationError("no token");
      const context = new Context();
      await expect(
        handler.authorize(
          { request: handler.requestValue } as MyCtx,
          "Model",
          undefined,
          context
        )
      ).rejects.toThrow(AuthorizationError);
      expect(handler.actions).toHaveLength(1);
      const { name, classUid, meta } = handler.actions[0];
      expect(name).toBe("user_login");
      expect(classUid).toBe(AUTH_CLASS_UID_AUTHENTICATION);
      expect(meta).toMatchObject({
        name: "user_login",
        outcome: "failure",
      });
      expect(meta.error_code).toBeUndefined();
    });

    it("emits user_login failure when role validation fails after data extraction", async () => {
      const handler = new TestAuthHandler();
      handler.logAccess = true;
      handler.authData = { user: "bob", roles: ["user"] };
      const context = new Context();
      await expect(
        handler.authorize(
          { request: handler.requestValue } as MyCtx,
          "Model",
          ["admin"],
          context
        )
      ).rejects.toThrow(AuthorizationError);
      expect(handler.actions).toHaveLength(1);
      const { meta } = handler.actions[0];
      expect(meta.outcome).toBe("failure");
      expect(meta.user).toBeUndefined();
      expect(meta.error_code).toBeUndefined();
    });
  });

  describe("ocsfOutcomeOf", () => {
    const handler = new TestAuthHandler();

    it("maps no error to success", () => {
      expect(handler.exposeOcsfOutcomeOf(undefined)).toBe("success");
      expect(handler.exposeOcsfOutcomeOf(null)).toBe("success");
    });

    it("maps AuthorizationError to failure", () => {
      expect(handler.exposeOcsfOutcomeOf(new AuthorizationError("x"))).toBe(
        "failure"
      );
    });

    it("maps AuthorizationError subclasses to failure", () => {
      expect(handler.exposeOcsfOutcomeOf(new ForbiddenError("x"))).toBe(
        "failure"
      );
    });

    it("maps unknown errors to error", () => {
      expect(handler.exposeOcsfOutcomeOf(new Error("boom"))).toBe("error");
      expect(handler.exposeOcsfOutcomeOf(new TypeError("x"))).toBe("error");
    });

    it("maps auth-named errors to failure via name regex", () => {
      const tokenError = new Error("expired");
      (tokenError as any).name = "TokenExpiredError";
      expect(handler.exposeOcsfOutcomeOf(tokenError)).toBe("failure");

      const credError = new Error("bad");
      (credError as any).name = "InvalidCredentialException";
      expect(handler.exposeOcsfOutcomeOf(credError)).toBe("failure");

      const authError = new Error("nope");
      (authError as any).name = "AuthenticationException";
      expect(handler.exposeOcsfOutcomeOf(authError)).toBe("failure");
    });

    it("only ever returns values from the outcome set", () => {
      const samples = [
        undefined,
        new AuthorizationError("x"),
        new ForbiddenError("x"),
        new Error("boom"),
        (() => {
          const e = new Error();
          (e as any).name = "UnauthorizedError";
          return e;
        })(),
      ];
      for (const s of samples) {
        expect(OUTCOMES).toContain(handler.exposeOcsfOutcomeOf(s));
      }
    });
  });

  describe("buildAuthActionMeta", () => {
    const handler = new TestAuthHandler();

    it("carries name and outcome as custom properties", () => {
      const meta = handler.exposeBuildAuthActionMeta({
        name: "user_login",
        outcome: "success",
        data: { user: "alice", roles: [] },
      });
      expect(meta).toMatchObject({
        name: "user_login",
        outcome: "success",
      });
    });

    it("does not carry category or class_uid in the payload", () => {
      const meta = handler.exposeBuildAuthActionMeta({
        name: "user_login",
        outcome: "success",
        data: { user: "alice", roles: [] },
      });
      expect(meta.category).toBeUndefined();
      expect(meta.class_uid).toBeUndefined();
    });

    it("does not duplicate actor.user in the payload", () => {
      const meta = handler.exposeBuildAuthActionMeta({
        name: "user_login",
        outcome: "success",
        data: { user: "alice", roles: [] },
      });
      expect(meta.user).toBeUndefined();
      expect(meta.actor).toBeUndefined();
    });

    it("sets duration_ms when durationMs is provided", () => {
      const meta = handler.exposeBuildAuthActionMeta({
        name: "user_login",
        outcome: "success",
        durationMs: 123,
      });
      expect(meta.duration_ms).toBe(123);
    });

    it("omits duration_ms when not provided", () => {
      const meta = handler.exposeBuildAuthActionMeta({
        name: "user_login",
        outcome: "success",
      });
      expect(meta.duration_ms).toBeUndefined();
    });

    it("includes sessionType from authSessionOf", () => {
      const meta = handler.exposeBuildAuthActionMeta({
        name: "user_login",
        outcome: "success",
        data: { user: "alice" },
      });
      expect(meta.sessionType).toBe("bi_interactive_session");
      expect(meta.sessionId).toBeUndefined();
    });

    it("includes sessionId from overridden authSessionOf", () => {
      const withSession = new TestAuthHandler();
      withSession.sessionIdOverride = "sid-123";
      const meta = withSession.exposeBuildAuthActionMeta({
        name: "user_login",
        outcome: "success",
        data: { user: "alice" },
      });
      expect(meta.sessionId).toBe("sid-123");
      expect(meta.sessionType).toBe("bi_interactive_session");
    });

    it("does not carry error_code", () => {
      const meta = handler.exposeBuildAuthActionMeta({
        name: "user_login",
        outcome: "success",
      });
      expect(meta.error_code).toBeUndefined();
    });
  });

  describe("logAccessSessionEvent", () => {
    const makeMockLogger = (): {
      logger: Logger;
      calls: {
        name: string;
        message: string;
        classUid: number;
        meta: LogMeta;
      }[];
    } => {
      const calls: {
        name: string;
        message: string;
        classUid: number;
        meta: LogMeta;
      }[] = [];
      const logger = {
        action: (name: string, message: string, classUid?: number, ...rest: any[]) => {
          calls.push({
            name,
            message,
            classUid: classUid ?? 0,
            meta: rest[0] as LogMeta,
          });
        },
      } as unknown as Logger;
      return { logger, calls };
    };

    it("emits class_uid 3002 with sessionType when no log is passed", () => {
      const handler = new TestAuthHandler();
      handler.captureActions = false;
      const { logger, calls } = makeMockLogger();
      handler.logAccessSessionEvent(logger, { name: "user_logout" });
      expect(calls).toHaveLength(1);
      const call = calls[0];
      expect(call.name).toBe("user_logout");
      expect(call.classUid).toBe(AUTH_CLASS_UID_ACCOUNT_SESSION);
      expect(call.meta).toMatchObject({
        name: "user_logout",
        outcome: "success",
      });
      expect(call.meta.sessionType).toBe("bi_interactive_session");
      expect(call.meta.sessionId).toBeUndefined();
    });

    it("sets sessionId when sessionId is provided", () => {
      const handler = new TestAuthHandler();
      handler.captureActions = false;
      const { logger, calls } = makeMockLogger();
      handler.logAccessSessionEvent(logger, {
        name: "user_logout",
        sessionId: "sid-99",
      });
      expect(calls[0].meta.sessionId).toBe("sid-99");
    });

    it("sets user and outcome when provided", () => {
      const handler = new TestAuthHandler();
      handler.captureActions = false;
      const { logger, calls } = makeMockLogger();
      handler.logAccessSessionEvent(logger, {
        name: "session_terminate",
        outcome: "failure",
        user: "carol",
      });
      expect(calls[0].meta.user).toBe("carol");
      expect(calls[0].meta.outcome).toBe("failure");
    });
  });

  describe("OCSF constants", () => {
    it("exposes the documented class uids", () => {
      expect(AUTH_CLASS_UID_AUTHENTICATION).toBe(3001);
      expect(AUTH_CLASS_UID_ACCOUNT_SESSION).toBe(3002);
    });
  });
});
