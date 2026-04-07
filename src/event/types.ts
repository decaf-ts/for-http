import { BulkCrudOperationKeys, OperationKeys } from "@decaf-ts/db-decorators";
import { SseMessage } from "event-source-plus";

export type ServerEventType = "message" | "heartbeat" | string;

export type ServerRawMessage = SseMessage & {
  id?: string;
  event: ServerEventType;
  data: string;
  retry?: number;
};

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
