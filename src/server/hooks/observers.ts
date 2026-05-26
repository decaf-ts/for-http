import {
  Context,
  ContextualArgs,
  EventIds,
  ObserverFilter,
  PersistenceObserver,
  service,
} from "@decaf-ts/core";
import {
  BulkCrudOperationKeys,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { Constructor } from "@decaf-ts/decoration";
import { matchesTopic } from "./utils";
import { DeliveryServiceConfig } from "./types";
import { WebhookPublisherService } from "./PublisherService";
import { HttpFlags } from "../../types";

export const KnownTopicOperations = [
  OperationKeys.CREATE,
  OperationKeys.DELETE,
  OperationKeys.UPDATE,
];

export function eventToTopic<F extends boolean = false>(
  model: Constructor | string,
  action: OperationKeys | BulkCrudOperationKeys | string,
  fullResult: F = false as F
): F extends true ? { topic: string; action: string; entity: string } : string {
  if (KnownTopicOperations.includes(action as any)) {
    action = action + "d";
  }
  const modelVal = typeof model === "string" ? model : model.name;
  const topic = modelVal.toLowerCase();
  action = action.toLowerCase();
  return (
    !fullResult
      ? `${topic}.${action}`
      : { topic: `${topic}.${action}`, action: action, entity: topic }
  ) as F extends true
    ? { topic: string; action: string; entity: string }
    : string;
}

export function getWebhookFilter(
  config: DeliveryServiceConfig<any>
): ObserverFilter {
  return function (
    model: Constructor | string,
    action: OperationKeys | BulkCrudOperationKeys | string,
    ids: EventIds,
    ...args: ContextualArgs<Context<HttpFlags>>
  ) {
    const ctx = args.pop();
    if (!ctx.getOrUndefined("observeFullResult"))
      throw new InternalError(
        `"observeFullResult" config is necessary to enable webhooks`
      );

    const payload = args.shift();

    if (!payload)
      throw new InternalError(`no payload received in observable event`);

    const allowedTopics = config.topics;

    if (KnownTopicOperations.includes(action as any)) {
      action = action + "d";
    }
    const topic = eventToTopic(model, action);
    if (!allowedTopics || allowedTopics.length === 0) return true;
    return !!allowedTopics.filter((t) => matchesTopic(topic, t)).length;
  };
}

export class WebhookObserver implements PersistenceObserver<Context<HttpFlags>> {
  @service()
  publications!: WebhookPublisherService;

  constructor(protected config: DeliveryServiceConfig<any>) {}

  async refresh(
    model: Constructor | string,
    operation: OperationKeys | BulkCrudOperationKeys | string,
    ids: EventIds,
    payload: any | any[],
    ...args: ContextualArgs<Context<HttpFlags>>
  ) {
    const ctx = args.pop();
    const log = ctx.logger.for(this.refresh);
    const { entity, action } = eventToTopic(model, operation, true);

    ids = (Array.isArray(ids) ? ids : [ids]).map((n) => n.toString());
    payload = Array.isArray(payload) ? payload : [payload];
    if (ids.length !== payload.length)
      throw new InternalError(
        `id count doesn't match payload count. failed to update webhooks`
      );
    log.verbose(`Publishing ${ids.length} webhook events`);
    await this.publications.publish(
      ids.map((id, i) => ({
        entity: entity,
        action: action,
        entityId: id,
        payload: payload[i],
      }))
    );
  }
}
