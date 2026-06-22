import "reflect-metadata";
import { Metadata } from "@decaf-ts/decoration";
import { ServerKeys } from "../../src/server/constants";
import {
  del,
  get,
  patch,
  post,
  put,
  route,
} from "../../src/server/decorators";

type DecoratorFactory = (path: string) => ReturnType<typeof route>;

function applyDecorator(
  decoratorFactory: DecoratorFactory,
  path: string,
  method: (...args: any[]) => any
) {
  class Fixture {}

  Object.defineProperty(Fixture.prototype, "method", {
    value: method,
    configurable: true,
    enumerable: false,
    writable: true,
  });

  const descriptor = Object.getOwnPropertyDescriptor(
    Fixture.prototype,
    "method"
  )!;
  decoratorFactory(path)(Fixture.prototype, "method", descriptor);
  return Metadata.get(Fixture, Metadata.key(ServerKeys.ROUTE, "method"));
}

describe("server/decorators", () => {
  const sharedMethod = function sharedMethod() {
    return "shared";
  };

  it.each([
    ["get", get, "GET"],
    ["post", post, "POST"],
    ["put", put, "PUT"],
    ["patch", patch, "PATCH"],
    ["del", del, "DELETE"],
  ] as const)(
    "%s produces the same metadata as route(%s, path)",
    (_name, decoratorFactory, verb) => {
      const path = `/api/${_name}`;
      const fromVerb = applyDecorator(decoratorFactory, path, sharedMethod);
      const fromRoute = applyDecorator(
        (routePath) => route(verb, routePath),
        path,
        sharedMethod
      );

      expect(fromVerb).toEqual(fromRoute);
      expect(fromVerb).toMatchObject({
        path,
        httpMethod: verb,
      });
    }
  );
});
