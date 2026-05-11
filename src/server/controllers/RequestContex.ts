import { Context, ContextFlags } from "@decaf-ts/core";
import { Logger } from "@decaf-ts/logging";
import { type DecafController } from "./controllers";

export type RequestFlags<LOG extends Logger = any> = ContextFlags<LOG> & {
  headers?: Record<string, string>;
  overrides?: Record<string, any>;
  configs?: Record<string, any>;
};

export abstract class RequestContext<REQUEST> extends Context<RequestFlags> {
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
