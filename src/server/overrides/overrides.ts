import { Constructor, Metadata } from "@decaf-ts/decoration";
import { Model } from "@decaf-ts/decorator-validation";
import { HookKey } from "../hooks/constants";
import { HookMetadata } from "../hooks/decorators";

(Model as any).hooks = function hooks<M extends Model>(
  m: M | Constructor<M>,
  allowWildCard = false
): string[] {
  const constr = typeof m === "function" ? m : (m.constructor as any);
  const meta: HookMetadata = Metadata.get(constr, HookKey);
  if (!meta) return [];
  return allowWildCard
    ? [...meta.topics, constr.name.toLowerCase() + ".*"]
    : meta.topics;
};
