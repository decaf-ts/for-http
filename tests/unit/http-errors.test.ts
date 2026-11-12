import { it } from "@decaf-ts/for-testing";
import { AuthorizationError, ConnectionError, ForbiddenError, QueryError } from "@decaf-ts/core";
import {
  BadRequestError,
  ConflictError,
  InternalError,
  NotFoundError,
  ValidationError,
} from "@decaf-ts/db-decorators";
import {
  BadGatewayError,
  GatewayTimeoutError,
  HttpErrorsByStatus,
  MethodNotAllowedError,
  NotAcceptableError,
  parseErrorMessage,
  parseHttpError,
  PayloadTooLargeError,
  RequestTimeoutError,
  TooManyRequestsError,
  UnsupportedMediaTypeError,
} from "../../src/errors";
import { HttpAdapter } from "../../src/adapter";

describe("HTTP error contract", () => {
  it("parses both serialized message formats", () => {
    expect(parseErrorMessage("[NotFoundError][404] gone")).toEqual({
      name: "NotFoundError",
      code: 404,
      message: "gone",
    });
    expect(parseErrorMessage("[ForbiddenError] 403 | Missing required roles: x")).toEqual({
      name: "ForbiddenError",
      code: 403,
      message: "Missing required roles: x",
    });
    expect(parseErrorMessage("plain").name).toBeUndefined();
  });

  it("rebuilds the error named by the server body", () => {
    const body = { status: 403, error: "[ForbiddenError][403] Missing required roles: admin" };
    const error = parseHttpError(403, body);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.code).toBe(403);
    expect(error.message).toContain("Missing required roles: admin");
    expect(error.message).not.toMatch(/\[ForbiddenError\]\[403\].*\[ForbiddenError\]/);
  });

  it("names win over statuses (e.g. QueryError is a 500)", () => {
    expect(parseHttpError(500, { error: "[QueryError][500] bad query" })).toBeInstanceOf(
      QueryError
    );
  });

  it("handles production bodies that only carry the error name", () => {
    expect(parseHttpError(401, { status: 401, error: "AuthorizationError" })).toBeInstanceOf(
      AuthorizationError
    );
  });

  it("falls back to the status when the body names no error", () => {
    const cases: Array<[number, any]> = [
      [400, BadRequestError],
      [401, AuthorizationError],
      [403, ForbiddenError],
      [404, NotFoundError],
      [405, MethodNotAllowedError],
      [406, NotAcceptableError],
      [408, RequestTimeoutError],
      [409, ConflictError],
      [413, PayloadTooLargeError],
      [415, UnsupportedMediaTypeError],
      [422, ValidationError],
      [429, TooManyRequestsError],
      [500, InternalError],
      [502, BadGatewayError],
      [503, ConnectionError],
      [504, GatewayTimeoutError],
    ];
    for (const [status, Clazz] of cases) {
      const error = parseHttpError(status, { status, error: "Cannot GET /x" });
      expect(error).toBeInstanceOf(Clazz);
      expect(Object.keys(HttpErrorsByStatus)).toContain(String(status));
    }
  });

  it("keeps unmapped statuses as their code", () => {
    const teapot = parseHttpError(418, "short and stout");
    expect(teapot).toBeInstanceOf(BadRequestError);
    expect(teapot.code).toBe(418);
    const unknown = parseHttpError(599);
    expect(unknown).toBeInstanceOf(InternalError);
    expect(unknown.code).toBe(599);
  });

  it("HttpAdapter.parseError accepts responses, statuses, messages and decaf errors", () => {
    const decaf = new ConflictError("dup");
    expect(HttpAdapter.parseError(decaf)).toBe(decaf);
    expect(
      HttpAdapter.parseError({
        message: "Request failed with status code 403",
        response: { status: 403, data: { error: "[ForbiddenError][403] nope" } },
      } as any)
    ).toBeInstanceOf(ForbiddenError);
    expect(HttpAdapter.parseError(401)).toBeInstanceOf(AuthorizationError);
    expect(HttpAdapter.parseError("401")).toBeInstanceOf(AuthorizationError);
    expect(HttpAdapter.parseError("Request failed with status code 429")).toBeInstanceOf(
      TooManyRequestsError
    );
    expect(HttpAdapter.parseError("[ValidationError][422] name is required")).toBeInstanceOf(
      ValidationError
    );
    expect(HttpAdapter.parseError("something NotFoundError happened")).toBeInstanceOf(
      NotFoundError
    );
  });
});
