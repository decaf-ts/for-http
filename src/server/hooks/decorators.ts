import { HookKey } from "./constants";
import { apply, Metadata, metadata } from "@decaf-ts/decoration";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { keyToTopic } from "./utils";

export type HookMetadata = {
  topics: string[];
};

/**
 * @description Metadata keys used by the webhook hook decorators.
 * @summary Central registry of the metadata key prefixes that the webhook module
 * reads at decoration / serialization time. `WRITE_ONLY` marks a model property
 * as settable only on create and never readable back through the REST layer.
 * @memberOf module:for-http.hooks
 */
export const HookMetadataKeys = {
  WRITE_ONLY: "hooks.writeOnly",
} as const;

/**
 * @description Marks a model property as write-only.
 * @summary A write-only property is accepted on create (clients provide it, e.g.
 * a subscription secret) but is stripped from read/update responses and excluded
 * from the UPDATE OpenAPI DTO, so the value can never be read back through the
 * REST layer. The property remains fully persisted and readable at the repository
 * layer for internal use (e.g. signature verification).
 * @return {PropertyDecorator} The property decorator
 * @function writeOnly
 * @category Decorators
 * @memberOf module:for-http.hooks
 */
export function writeOnly(): PropertyDecorator {
  return function writeOnlyDecorator(target: any, propertyKey?: string | symbol) {
    const prop =
      typeof propertyKey === "string" ? propertyKey : propertyKey?.toString();
    if (!prop) return;
    const model =
      typeof target === "function" ? target : (target as any).constructor;
    Metadata.set(
      Metadata.constr(model),
      Metadata.key(HookMetadataKeys.WRITE_ONLY, prop),
      true
    );
  };
}

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
