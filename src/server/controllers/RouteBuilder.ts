import { ServerRoute, RouteParam, RouteResponse } from "./models";

export class ServerMethodBuilder {
  private method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" = "GET";
  private path: string = "";
  private summary?: string;
  private description?: string;
  private deprecated: boolean = false;
  private requiresAuth: boolean = true;
  private pathParams: RouteParam[] = [];
  private queryParams: RouteParam[] = [];
  private bodySchema?: any;
  private responses?: Record<number, RouteResponse>;

  withMethod(method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"): this {
    this.method = method;
    return this;
  }

  withPath(path: string): this {
    this.path = path;
    return this;
  }

  withSummary(summary: string): this {
    this.summary = summary;
    return this;
  }

  withDescription(description: string): this {
    this.description = description;
    return this;
  }
  //
  // withTag(tag: string): this {
  //   this.tags  =
  //   return this;
  // }

  withDeprecated(): this {
    this.deprecated = true;
    return this;
  }

  withRequiresAuth(requiresAuth: boolean): this {
    this.requiresAuth = requiresAuth;
    return this;
  }

  withPathParam(
    name: string,
    type: "string" | "number" | "boolean" | "array" | "object",
    required: boolean = true
  ): this {
    this.pathParams.push(new RouteParam({ name, type, required }));
    return this;
  }

  withQueryParam(
    name: string,
    type: "string" | "number" | "boolean" | "array" | "object",
    required: boolean = false
  ): this {
    this.queryParams.push(new RouteParam({ name, type, required }));
    return this;
  }

  withBodySchema(schema: any): this {
    this.bodySchema = schema;
    return this;
  }

  withResponse(status: number, description: string): this {
    this.responses = this.responses || {};
    this.responses[status] = new RouteResponse({ status, description });
    return this;
  }

  withImplementation() {
    return this;
  }

  build(): ServerRoute {
    return new ServerRoute({
      method: this.method,
      path: this.path,
      summary: this.summary,
      description: this.description,
      tags: [],
      deprecated: this.deprecated,
      requiresAuth: this.requiresAuth,
      pathParams: this.pathParams,
      queryParams: this.queryParams,
      bodySchema: this.bodySchema,
      responses: this.responses,
    });
  }
}
