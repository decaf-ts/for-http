import { Context, ContextFlags } from "@decaf-ts/core";
import { Logger, type LogMeta } from "@decaf-ts/logging";
import { type DecafController } from "./controllers";

export type RequestLogger = Logger & {
  fatal(msg: string | Error, error?: Error | LogMeta, meta?: LogMeta): void;
  critical(msg: string | Error, error?: Error | LogMeta, meta?: LogMeta): void;
};

export type RequestFlags<LOG extends RequestLogger = RequestLogger> = ContextFlags<LOG> & {
  headers?: Record<string, string>;
  overrides?: Record<string, any>;
  configs?: Record<string, any>;
};

export abstract class RequestContext<REQUEST> extends Context<
  RequestFlags<RequestLogger>
> {
  protected constructor(
    protected controller: DecafController<
      REQUEST,
      any,
      RequestContext<REQUEST>
    >,
    protected request: REQUEST
  ) {
    super();
  }

  protected generateOverrides() {
    const headers = this.controller["headersOf"](this.request);
    function parseIpHeader(value?: string | string[]): string | undefined {
      if (!value) return undefined;
      const candidate = Array.isArray(value) ? value[0] : value;
      return candidate
        .split(",")
        .map((segment) => segment.trim())
        .filter(Boolean)[0];
    }
    const forwarded =
      parseIpHeader(headers?.["x-forwarded-for"]) ??
      parseIpHeader(headers?.["x-real-ip"]) ??
      parseIpHeader(headers?.["X-Forwarded-For"]) ??
      parseIpHeader(headers?.["X-Real-IP"]);
    if (forwarded) return forwarded;
  }
}
