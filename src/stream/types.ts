import { BulkCrudOperationKeys, OperationKeys } from "@decaf-ts/db-decorators";

export type ServerEvent = readonly [
  modelName: string,
  operation: OperationKeys | BulkCrudOperationKeys | string,
  id: string,
  payload: any,
];

export type EventHandlers = {
  onEvent: ([tableName, operation, id]: ServerEvent) => void;
  onError: (err: unknown) => void;
};
