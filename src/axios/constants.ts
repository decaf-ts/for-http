import { ResponseParser } from "../types";
import { AxiosFlags } from "./types";
import { Context } from "@decaf-ts/core";

/**
 * @description Axios adapter flavor identifier
 * @summary Constant string identifier used to identify the Axios implementation of the HTTP adapter
 * @const {string} AxiosFlavour
 * @memberOf module:for-http.axios
 */
export const AxiosFlavour = "axios";

export const TaskResponseParser: ResponseParser = (
  res: any,
  ctx: Context<AxiosFlags>
) => {
  if (res.headers && res.headers["x-pending-task"]) {
    let pending: Record<string, string[]>;
    try {
      pending = JSON.parse(res.headers["x-pending-task"]);
      Object.entries(pending).forEach(([key, value]) => {
        value.forEach((v) => ctx.pushPending(key, v));
      });
    } catch (e: unknown) {
      ctx.logger
        .for(TaskResponseParser)
        .error(
          `Failed to parse pending tasks header ${res.headers["x-pending-task"]}: ${e}`
        );
    }
  }
};
