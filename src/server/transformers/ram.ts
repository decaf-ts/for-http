import {
  RequestToContextTransformer,
  requestToContextTransformer,
} from "./context";

export class RamTransformer implements RequestToContextTransformer<any> {
  constructor() {}

  async from(req: any): Promise<any> {
    const user = req.headers.authorization
      ? req.headers.authorization.split(" ")[1]
      : undefined;
    if (!user) {
      return {
        headers: req?.headers || {},
        overrides: {},
      };
    }
    return {
      UUID: user,
      headers: req?.headers || {},
      overrides: {},
    };
  }
}

// @requestToContextTransformer("ram")
requestToContextTransformer("ram")(RamTransformer);
