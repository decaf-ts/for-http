import { Metadata, metadata } from "@decaf-ts/decoration";

export abstract class RequestToContextTransformer<C = any> {
  abstract from(req: any, ...args: any[]): Promise<C>;
}

export function requestToContextTransformer(flavour: string) {
  return function requestToContextTransformer(original: any) {
    Metadata.set("transformers", flavour, original);
    if (typeof original === "function")
      return metadata("transformers", flavour)(original);
    return original;
  };
}
