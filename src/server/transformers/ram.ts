import {
  RequestToContextTransformer,
  requestToContextTransformer,
} from "./context";

/**
 * Translates auth-populated context fields into RamAdapter-specific keys.
 *
 * Reads `user` from the context (set by the auth handler's `bindToContext`)
 * and maps it to `UUID` — the key RamAdapter's `@createdBy` / `@updatedBy`
 * handlers read.
 */
export class RamTransformer implements RequestToContextTransformer<any> {
  constructor() {}

  async from(ctx: any): Promise<any> {
    const user = ctx.getOrUndefined?.("user");
    if (!user) {
      return { overrides: {} };
    }
    return { UUID: user, overrides: {} };
  }
}

// @requestToContextTransformer("ram")
requestToContextTransformer("ram")(RamTransformer);
