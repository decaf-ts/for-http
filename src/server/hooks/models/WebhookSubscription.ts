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
import { description } from "@decaf-ts/decoration";
import {
  Model,
  model,
  type ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { writeOnly } from "../decorators";

@table("webhook_subscriptions")
@model()
export class WebhookSubscription extends Model {
  @pk()
  @uuid()
  @description("the subscription id")
  id!: string;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("subscription topic eg <model>.created, <model>.*, etc")
  topic!: string;

  @column()
  @required()
  @description("optional task name for ambiguity")
  url!: string;

  @column()
  @required()
  @description("subscription secret")
  @writeOnly()
  secret!: string;

  /**
   * @description Authenticated principal that owns this subscription.
   * @summary Used to scope the webhook lifecycle/action routes (deactivate,
   * reactivate) so a caller cannot toggle another principal's subscription
   * (IDOR). Populated from the request's authenticated user at creation; empty
   * for legacy resources created before ownership tracking was added.
   */
  @column()
  @description("authenticated principal that owns this subscription")
  owner?: string;

  // execution
  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC], ["active", "createdAt", "id"])
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
