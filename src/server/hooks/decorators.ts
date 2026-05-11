import { HookKey } from "./constants";
import { apply, Metadata, metadata } from "@decaf-ts/decoration";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { keyToTopic } from "./utils";

export type HookMetadata = {
  topics: string[];
};

export function hook(
  ops: OperationKeys[] = [
    OperationKeys.CREATE,
    OperationKeys.UPDATE,
    OperationKeys.DELETE,
  ]
) {
  return function hook(target: any) {
    const meta: HookMetadata = {
      topics: ops.map((o) => `${target.name.toLowerCase()}.${keyToTopic(o)}`),
    };
    Metadata.set(HookKey, target.name, Metadata.constr(target));
    return apply(metadata(HookKey, meta))(target);
  };
}
