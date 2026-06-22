import {
  apply,
  Decoration,
  Metadata,
  methodMetadata,
} from "@decaf-ts/decoration";
import { ServerKeys } from "./constants";
import { HttpVerbs, ServerRouteDecOptions } from "./types";

export function route(httpMethod: HttpVerbs, path: string) {
  const key = ServerKeys.ROUTE;
  function route() {
    return function route(obj: object, prop?: any, descriptor?: any) {
      const options: ServerRouteDecOptions = {
        path: path,
        httpMethod: httpMethod,
        handler: descriptor,
      };

      return apply(methodMetadata(Metadata.key(key, prop), options))(
        obj,
        prop,
        descriptor
      );
    };
  }

  return Decoration.for(key)
    .define({
      decorator: route,
      args: [],
    })
    .apply();
}

export const get = (path: string) => route("GET", path);
export const post = (path: string) => route("POST", path);
export const put = (path: string) => route("PUT", path);
export const patch = (path: string) => route("PATCH", path);
export const del = (path: string) => route("DELETE", path);
