import { BulkCrudOperationKeys, OperationKeys } from "@decaf-ts/db-decorators";
import { PreparedStatementKeys } from "@decaf-ts/core";
import { HttpAdapter } from "./adapter";

export class ResponseParser<RESPONSE = any> {
  parse(method: string, response: RESPONSE): any {
    return response;
  }
}

export class NestJSResponseParser extends ResponseParser<{
  status: number;
  raw: any;
  data: any;
}> {
  override parse(
    method: string,
    response: {
      status: number;
      raw: any;
      data: any;
    }
  ): any {
    if (!(response.status >= 200 && response.status < 300))
      throw HttpAdapter.parseError(response.status.toString());

    switch (method) {
      case BulkCrudOperationKeys.CREATE_ALL:
      case BulkCrudOperationKeys.READ_ALL:
      case BulkCrudOperationKeys.UPDATE_ALL:
      case BulkCrudOperationKeys.DELETE_ALL:
      case PreparedStatementKeys.FIND_BY:
      case PreparedStatementKeys.LIST_BY:
      case PreparedStatementKeys.PAGE_BY:
        return response.raw;
      case OperationKeys.CREATE:
      case OperationKeys.READ:
      case OperationKeys.UPDATE:
      case OperationKeys.DELETE:
        return response.data;
      case PreparedStatementKeys.FIND_ONE_BY:
      case "statement":
      default:
        return response.raw;
    }
  }
}
