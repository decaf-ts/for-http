import { Constructor, Metadata } from "@decaf-ts/decoration";
import { Model } from "@decaf-ts/decorator-validation";
import { HookKey } from "../hooks/constants";
import { HookMetadata } from "../hooks/decorators";

(Model as any).hooks = function hooks<M extends Model>(
  m: M | Constructor<M>
): string[] {
  const meta: HookMetadata = Metadata.get(
    typeof m === "function" ? m : (m.constructor as any),
    HookKey
  );
  if (!meta) return [];
  return meta.topics;
};
