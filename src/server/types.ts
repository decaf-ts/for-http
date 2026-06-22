export type HttpVerbs = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ServerApiProperty = {
  name: string;
  description?: string;
  required?: boolean;
  type?: any;
};

export type ServerModelRoute = {
  path: string;
  description?: string;
  apiProperties: ServerApiProperty[];
  getPK: (...args: Array<string | number>) => string;
};

export type ServerParamProps = {
  raw: Record<string, string | number>;
  keysInOrder: Array<string>;
  valuesInOrder: Array<string | number>;
};

export interface ServerRouteDecOptions {
  path: string;
  httpMethod: HttpVerbs;
  handler: PropertyDescriptor;
}
