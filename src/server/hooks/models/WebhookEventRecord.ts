import {
  column,
  createdAt,
  index,
  OrderDirection,
  pk,
  table,
  uuid,
  updatedAt,
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

@table("webhook_events")
@model()
export class WebhookEventRecord extends Model {
  @pk()
  @uuid()
  @description("the subscription id")
  id!: string;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("subscription topic eg <model>.create, <model>.*, etc")
  topic!: string;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("model name")
  model!: string;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("action eg created, updated, ...")
  action!: string;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("receiving entity id")
  entityId!: string;

  @column()
  @required()
  @description("JSON string")
  payload!: string;

  @column()
  @required()
  @option(WebhookStatus)
  @description("Status of event")
  status!: WebhookStatus;

  @column()
  @required()
  @description("count of deliveries")
  deliveriesTotal!: number;

  @column()
  @prop()
  @description("count of sucessfull deliveries")
  deliveriesSucceeded!: number;

  @column()
  @prop()
  @description("count of failed deliveries")
  deliveriesFailed!: number;

  @column()
  @required()
  @date()
  @description("date of next delivery attempt")
  nextAttemptAt!: Date;

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

  constructor(arg?: ModelArg<WebhookEventRecord>) {
    super(arg);
  }
}
