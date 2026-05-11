import {
  column,
  createdAt,
  index,
  OrderDirection,
  pk,
  table,
  updatedAt,
} from "@decaf-ts/core";
import { description } from "@decaf-ts/decoration";
import {
  Model,
  model,
  type ModelArg,
  required,
} from "@decaf-ts/decorator-validation";

@table("webhook_subscriptions")
@model()
export class WebhookSubscription extends Model {
  @pk()
  @description("the subscription id")
  id!: string;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("subscription topic eg <model>.create, <model>.*, etc")
  topic!: string;

  @column()
  @required()
  @description("optional task name for ambiguity")
  url!: string;

  @column()
  @required()
  @description("subscription secret")
  secret!: string;

  // execution
  @column()
  @required()
  @description("control the status of the subscription")
  active!: boolean;

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

  constructor(arg?: ModelArg<WebhookSubscription>) {
    super(arg);
  }
}
