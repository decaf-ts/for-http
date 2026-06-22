import { ServerRoute } from "./models";
import { ServerMethodBuilder } from "./RouteBuilder";

export class ServerControllerBuilder<C = any> {
  protected prefix: string = "";
  protected path: string = "";
  protected tags: string[] = [];
  protected methods: ServerRoute[] = [];

  constructor() {}

  withPrefix(prefix: string): this {
    this.prefix = prefix;
    return this;
  }

  withPath(path: string): this {
    this.path = path;
    return this;
  }

  withTags(tags: string[]): this {
    this.tags = tags;
    return this;
  }

  addMethod(): ServerMethodBuilder {
    const methodBuilder = new ServerMethodBuilder();
    const buildProxy = new Proxy(methodBuilder.build, {
      apply: (target, thisArg, args) => {
        const result = Reflect.apply(target, thisArg, args);
        this.methods.push(result);
        return this;
      },
    });
    return new Proxy(methodBuilder, {
      get: (target, prop, receiver) => {
        if (prop === "build") {
          return buildProxy;
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  addMethodFromRoute(...route: ServerRoute[]): this {
    this.methods.push(...route);
    return this;
  }

  build(): C {
    const routeMethods = [...this.methods];
    const routeMap = new Map<string, ServerRoute>();
    const controllerClass = class {};

    for (const route of routeMethods) {
      const methodName = this.getMethodName(route);
      routeMap.set(methodName, route);

      Object.defineProperty(controllerClass.prototype, methodName, {
        configurable: true,
        enumerable: false,
        writable: false,
        value: route.implementation ?? (() => void 0),
      });
    }

    Object.defineProperty(controllerClass, "__routes__", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: routeMethods,
    });

    Object.defineProperty(controllerClass, "__routeMap__", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: routeMap,
    });

    return controllerClass as unknown as C;
  }

  protected getMethodName(route: ServerRoute): string {
    const segments = route.path.split("/").filter(Boolean);
    if (segments.length === 0) {
      return route.method.toLowerCase();
    }
    const lastSegment = segments[segments.length - 1];

    if (lastSegment.startsWith(":") || lastSegment.startsWith("{")) {
      const paramName = lastSegment.replace(/[:{}]/g, "");
      const prevSegment = segments[segments.length - 2] || "item";
      return `${route.method.toLowerCase()}${this.capitalize(prevSegment)}${this.capitalize(paramName)}`;
    }

    return `${route.method.toLowerCase()}${this.capitalize(lastSegment)}`;
  }

  protected capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
