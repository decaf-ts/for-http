import {
  list,
  minlength,
  Model,
  ModelArg,
  option,
  required,
  type,
} from "@decaf-ts/decorator-validation";
import { prop } from "@decaf-ts/decoration";

export class RouteParam extends Model {
  @required()
  name!: string;

  @required()
  @option(["string", "number", "boolean", "array", "object"])
  type!: string;

  @required()
  required!: boolean;

  constructor(arg?: ModelArg<RouteParam>) {
    super(arg);
    Model.fromObject(this, arg);
  }
}


export class RouteResponse extends Model {
  @required()
  description!: string;
  @prop()
  schema?: any;
  @prop()
  examples?: any;
  @prop()
  content?: any;

  constructor(arg?: ModelArg<RouteResponse>) {
    super(arg);
    Model.fromObject(this, arg);
  }
}

export class ServerRoute extends Model {
  @required()
  @option(["GET", "POST", "PUT", "DELETE", "PATCH"])
  method!: string;

  @required()
  path!: string;

  @minlength(0)
  summary?: string;

  @minlength(0)
  description?: string;

  @list(String)
  tags?: string[];

  @prop()
  deprecated?: boolean;

  @prop()
  requiresAuth?: boolean;

  @list(() => RouteParam)
  pathParams?: RouteParam[];

  @list(() => RouteParam)
  queryParams?: RouteParam[];

  @prop()
  bodySchema?: any;

  @type(Object)
  responses?: { [statusCode: number]: RouteResponse };

  @prop()
  version?: string;

  @prop()
  headers?: Record<string, string>;

  @minlength(0)
  redirectUrl?: string;

  @prop()
  redirectStatusCode?: number;

  implementation?: (...args: any[]) => any;

  constructor(arg?: ModelArg<ServerRoute>) {
    super(arg);
    Model.fromObject(this, arg);
  }
}
