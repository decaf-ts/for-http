import {
  column,
  createdAt,
  index,
  OrderDirection,
  pk,
  table,
  updatedAt,
  uuid,
} from "@decaf-ts/core";
import { description, prop } from "@decaf-ts/decoration";
import {
  date,
  Model,
  model,
  type ModelArg,
  option,
  required,
} from "@decaf-ts/decorator-validation";
import { WebhookStatus } from "../constants";

@table("webhook_deliveries")
@model()
export class WebhookDelivery extends Model {
  @pk()
  @uuid()
  @description("the delivery id")
  id!: string;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("the event id")
  eventId!: string;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("the subscription id")
  subscriptionId!: string;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("subscription topic eg <model>.create, <model>.*, etc")
  topic!: string;

  @column()
  @required()
  @description("optional task name for ambiguity")
  targetUrl!: string;

  @column()
  @required()
  @description("subscription secret")
  secret!: string;

  @column()
  @required()
  @description("number of attempts")
  attempts!: number;

  @column()
  @required()
  @description("number of maximum attempts")
  maxAttempts!: number;

  @column()
  @required()
  @date()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @index([OrderDirection.ASC, OrderDirection.DSC], ["createdAt"])
  @index([OrderDirection.ASC, OrderDirection.DSC], ["status", "nextAttemptAt"])
  @description("date of next delivery attempt")
  nextAttemptAt!: Date;

  @column()
  @date()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("date of last delivery attempt")
  lastAttemptAt?: Date;

  @column()
  @prop()
  @description("the response received")
  responseStatus?: number;

  @column()
  @prop()
  @description("the response received (if any)")
  responseBody?: string;

  @column()
  @prop()
  @description("the error received (if any)")
  errorMessage?: string;

  @column()
  @required()
  @option(WebhookStatus)
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Status of delivery")
  status!: WebhookStatus;

  /**
   * @description Creation timestamp for the model
   * @summary Automatically set to the current date and time when the model is created
   */
  @column()
  @createdAt()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("timestamp of creation")
  createdAt!: Date;

  /**
   * @description Last update timestamp for the model
   * @summary Automatically updated to the current date and time whenever the model is modified
   */
  @column()
  @updatedAt()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("timestamp of last update")
  updatedAt!: Date;

  constructor(arg?: ModelArg<WebhookDelivery>) {
    super(arg);
  }
}
