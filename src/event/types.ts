import { BulkCrudOperationKeys, OperationKeys } from "@decaf-ts/db-decorators";
import { SseMessage } from "event-source-plus";

export type ServerEventType = "message" | "heartbeat" | string;

export type ServerRawMessage = SseMessage & {
  id?: string;
  event: ServerEventType;
  data: string;
  retry?: number;
};

export type SingleServerEvent<T> = readonly [
  modelName: string,
  operation: OperationKeys | string,
  id: string,
  payload: T,
];

export type BulkServerEvent<T> = readonly [
  modelName: string,
  operation: BulkCrudOperationKeys,
  id: string[],
  payload: T[],
];

export type ServerEvent<T> = SingleServerEvent<T> | BulkServerEvent<T>;

export type EventHandlers = {
  onEvent: ([tableName, operation, id]: ServerEvent<any>) => void;
  onError: (err: unknown) => void;
};
