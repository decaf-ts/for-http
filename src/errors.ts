/**
 * @module for-http/errors
 * @description HTTP error contract shared by the decaf HTTP servers and the HttpAdapter client.
 * @summary Servers (e.g. `@decaf-ts/for-nest`'s exception filter) answer every failure with the
 * status code of a decaf {@link BaseError} and a body whose `error` field carries the error
 * message (`[Name][code] message`) — or only the error name in production. This module
 * defines the HTTP-specific errors that have no equivalent in `@decaf-ts/db-decorators` /
 * `@decaf-ts/core`, and {@link parseHttpError}, which turns a status + body back into the
 * same decaf error on the client side.
 */
import {
  AuthorizationError,
  ConnectionError,
  ForbiddenError,
  MigrationError,
  ObserverError,
  PagingError,
  QueryError,
  UnsupportedError,
} from "@decaf-ts/core";
import {
  BadRequestError,
  BaseError,
  ConflictError,
  InternalError,
  NotFoundError,
  SerializationError,
  ValidationError,
} from "@decaf-ts/db-decorators";

/**
 * @description HTTP 405 — the route exists but not for the requested method.
 * @class MethodNotAllowedError
 */
export class MethodNotAllowedError extends BadRequestError {
  constructor(msg: string | Error) {
    super(msg, MethodNotAllowedError.name, 405);
  }
}

/**
 * @description HTTP 406 — the request cannot be served as requested (e.g. no such route, or an
 * operation the backend does not support).
 * @class NotAcceptableError
 */
export class NotAcceptableError extends BadRequestError {
  constructor(msg: string | Error) {
    super(msg, NotAcceptableError.name, 406);
  }
}

/**
 * @description HTTP 408 — the server timed out waiting for the request.
 * @class RequestTimeoutError
 */
export class RequestTimeoutError extends BadRequestError {
  constructor(msg: string | Error) {
    super(msg, RequestTimeoutError.name, 408);
  }
}

/**
 * @description HTTP 413 — the request body exceeds the server limits.
 * @class PayloadTooLargeError
 */
export class PayloadTooLargeError extends BadRequestError {
  constructor(msg: string | Error) {
    super(msg, PayloadTooLargeError.name, 413);
  }
}

/**
 * @description HTTP 415 — the request content type is not supported.
 * @class UnsupportedMediaTypeError
 */
export class UnsupportedMediaTypeError extends BadRequestError {
  constructor(msg: string | Error) {
    super(msg, UnsupportedMediaTypeError.name, 415);
  }
}

/**
 * @description HTTP 429 — rate limit exceeded.
 * @class TooManyRequestsError
 */
export class TooManyRequestsError extends BadRequestError {
  constructor(msg: string | Error) {
    super(msg, TooManyRequestsError.name, 429);
  }
}

/**
 * @description HTTP 502 — an upstream service answered with an invalid response.
 * @class BadGatewayError
 */
export class BadGatewayError extends InternalError {
  constructor(msg: string | Error) {
    super(msg, BadGatewayError.name, 502);
  }
}

/**
 * @description HTTP 504 — an upstream service did not answer in time.
 * @class GatewayTimeoutError
 */
export class GatewayTimeoutError extends InternalError {
  constructor(msg: string | Error) {
    super(msg, GatewayTimeoutError.name, 504);
  }
}

type ErrorFactory = (msg: string) => BaseError;

/**
 * @description Decaf errors that can travel over HTTP, by name.
 * @summary Used to rebuild the exact error class from the `error` field of a response body.
 * @const HttpErrorsByName
 */
export const HttpErrorsByName: Record<string, ErrorFactory> = {
  [BadRequestError.name]: (m) => new BadRequestError(m),
  [ValidationError.name]: (m) => new ValidationError(m),
  [NotFoundError.name]: (m) => new NotFoundError(m),
  [ConflictError.name]: (m) => new ConflictError(m),
  [InternalError.name]: (m) => new InternalError(m),
  [SerializationError.name]: (m) => new SerializationError(m),
  [AuthorizationError.name]: (m) => new AuthorizationError(m),
  [ForbiddenError.name]: (m) => new ForbiddenError(m),
  [ConnectionError.name]: (m) => new ConnectionError(m),
  [QueryError.name]: (m) => new QueryError(m),
  [PagingError.name]: (m) => new PagingError(m),
  [UnsupportedError.name]: (m) => new UnsupportedError(m),
  [MigrationError.name]: (m) => new MigrationError(m),
  [ObserverError.name]: (m) => new ObserverError(m),
  [MethodNotAllowedError.name]: (m) => new MethodNotAllowedError(m),
  [NotAcceptableError.name]: (m) => new NotAcceptableError(m),
  [RequestTimeoutError.name]: (m) => new RequestTimeoutError(m),
  [PayloadTooLargeError.name]: (m) => new PayloadTooLargeError(m),
  [UnsupportedMediaTypeError.name]: (m) => new UnsupportedMediaTypeError(m),
  [TooManyRequestsError.name]: (m) => new TooManyRequestsError(m),
  [BadGatewayError.name]: (m) => new BadGatewayError(m),
  [GatewayTimeoutError.name]: (m) => new GatewayTimeoutError(m),
};

/**
 * @description Decaf error for each HTTP status, used when the body does not name the error.
 * @const HttpErrorsByStatus
 */
export const HttpErrorsByStatus: Record<number, ErrorFactory> = {
  400: (m) => new BadRequestError(m),
  401: (m) => new AuthorizationError(m),
  403: (m) => new ForbiddenError(m),
  404: (m) => new NotFoundError(m),
  405: (m) => new MethodNotAllowedError(m),
  406: (m) => new NotAcceptableError(m),
  408: (m) => new RequestTimeoutError(m),
  409: (m) => new ConflictError(m),
  413: (m) => new PayloadTooLargeError(m),
  415: (m) => new UnsupportedMediaTypeError(m),
  422: (m) => new ValidationError(m),
  429: (m) => new TooManyRequestsError(m),
  500: (m) => new InternalError(m),
  501: (m) => new UnsupportedError(m),
  502: (m) => new BadGatewayError(m),
  503: (m) => new ConnectionError(m),
  504: (m) => new GatewayTimeoutError(m),
};

/** `[Name][code] message` (BaseError constructor format) */
const CODED_PREFIX = /^\s*\[([A-Za-z]\w*)\]\[(\d{3})\]\s*/;
/** `[Name] code | message` (BaseError `message` getter format) */
const PIPED_PREFIX = /^\s*\[([A-Za-z]\w*)\]\s*(\d{3})\s*\|\s*/;

/**
 * @description Splits a serialized decaf error message into name, code and plain message.
 * @param {string} text - e.g. `[NotFoundError][404] Record not found`.
 * @return {{name: (string|undefined), code: (number|undefined), message: string}} The parts (all prefixes stripped).
 * @function parseErrorMessage
 */
export function parseErrorMessage(text: string): {
  name?: string;
  code?: number;
  message: string;
} {
  let name: string | undefined;
  let code: number | undefined;
  let message = text;
  for (;;) {
    const match = message.match(CODED_PREFIX) || message.match(PIPED_PREFIX);
    if (!match) break;
    name = name ?? match[1];
    code = code ?? Number(match[2]);
    message = message.slice(match[0].length);
  }
  return { name, code, message };
}

function errorText(body: unknown): string | undefined {
  if (body === null || typeof body === "undefined") return undefined;
  if (typeof body === "string") {
    try {
      return errorText(JSON.parse(body)) ?? body;
    } catch {
      return body;
    }
  }
  if (typeof body === "object") {
    const record = body as Record<string, unknown>;
    for (const key of ["error", "message"]) {
      const value = record[key];
      if (typeof value === "string" && value) return value;
      if (value && typeof value === "object") return errorText(value);
    }
  }
  return undefined;
}

function statusOfBody(body: unknown): number | undefined {
  if (!body || typeof body !== "object") return undefined;
  const { status, code } = body as Record<string, unknown>;
  if (typeof status === "number") return status;
  if (typeof code === "number") return code;
  return undefined;
}

/**
 * @description Rebuilds the decaf error of a failed HTTP call.
 * @summary Resolution order:
 * 1. the error named in the body (`[Name][code] message`, or just `Name` when the server masks
 *    messages in production) — the exact class the server raised;
 * 2. the HTTP status ({@link HttpErrorsByStatus});
 * 3. any other 4xx → {@link BadRequestError}, any other 5xx → {@link InternalError}, both
 *    keeping the original status as their `code`.
 * @param {number | undefined} status - The HTTP status (falls back to the body's `status`/`code`).
 * @param {unknown} [body] - The response body (object or raw string).
 * @return {BaseError} The decaf error.
 * @function parseHttpError
 */
export function parseHttpError(
  status: number | undefined,
  body?: unknown
): BaseError {
  const text = errorText(body);
  const httpStatus = status ?? statusOfBody(body);
  if (text) {
    const parsed = parseErrorMessage(text);
    const byName =
      (parsed.name && HttpErrorsByName[parsed.name]) ||
      (!parsed.name && HttpErrorsByName[text.trim()]);
    if (byName) return byName(parsed.name ? parsed.message : text.trim());
  }
  const message = text ?? (httpStatus ? `HTTP ${httpStatus}` : "Unknown error");
  if (httpStatus && HttpErrorsByStatus[httpStatus])
    return HttpErrorsByStatus[httpStatus](message);
  if (httpStatus && httpStatus >= 400 && httpStatus < 500)
    return new BadRequestError(message, BadRequestError.name, httpStatus);
  return new InternalError(message, InternalError.name, httpStatus ?? 500);
}
