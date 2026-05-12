import {
  type MaybeContextualArg,
  type Repo,
  repository,
  service,
  Service,
  UUID,
} from "@decaf-ts/core";
import { WebhookSubscription } from "./models/WebhookSubscription";
import { matchesTopic } from "./utils";
import type { WebhookAction, WebhookEnvelope, WebhookTopic } from "./types";
import { WebhookEventRecord } from "./models/WebhookEventRecord";
import { WebhookDelivery } from "./models/WebhookDelivery";
import { WebhookStatus } from "./constants";

export type PublishDto<TPayload> = {
  entity: string;
  action: WebhookAction;
  entityId: string;
  payload: TPayload;
};

@service()
export class WebhookPublisherService extends Service {
  @repository(WebhookSubscription)
  subscriptions!: Repo<WebhookSubscription>;

  @repository(WebhookDelivery)
  deliveries!: Repo<WebhookDelivery>;

  @repository(WebhookEventRecord)
  events!: Repo<WebhookEventRecord>;

  constructor() {
    super("hook-publisher");
  }

  async publish<TPayload>(
    evt: PublishDto<TPayload> | PublishDto<TPayload>[],
    ...args: MaybeContextualArg<any>
  ): Promise<void> {
    const { log, ctx } = (
      await this.logCtx(args, "publish", true)
    ).for(this.publish);
    const entries = Array.isArray(evt) ? evt : [evt];
    if (!entries.length) {
      return;
    }

    const now = new Date();

    const activeSubscriptions = await this.subscriptions
      .select()
      .where(this.subscriptions.attr("active").eq(true))
      .execute(ctx);

    const rows = await Promise.all(
      entries.map(async (entry) => {
        const topic: WebhookTopic = `${entry.entity}.${entry.action}`;
        const matching = activeSubscriptions.filter((s: WebhookSubscription) =>
          matchesTopic(topic, s.topic)
        );

        log.debug(
          `found ${matching.length} matching subscriptions to the topic ${topic}`
        );

        const envelope: WebhookEnvelope<TPayload> = {
          id: await UUID.instance.generate(),
          topic,
          entity: entry.entity,
          action: entry.action,
          entityId: entry.entityId,
          occurredAt: now.toISOString(),
          payload: entry.payload,
        };

        const event = new WebhookEventRecord({
          id: envelope.id,
          model: entry.entity,
          action: entry.action,
          entityId: entry.entityId,
          topic,
          payload: JSON.stringify(envelope),
          status:
            matching.length > 0
              ? WebhookStatus.PENDING
              : WebhookStatus.COMPLETED,
          deliveriesTotal: matching.length,
          deliveriesSucceeded: 0,
          deliveriesFailed: 0,
          nextAttemptAt: now,
        });

        const deliveryRows = matching.map((subscription) => {
          return new WebhookDelivery({
            eventId: event.id,
            subscriptionId: subscription.id,
            topic,
            targetUrl: subscription.url,
            secret: subscription.secret,
            status: WebhookStatus.PENDING,
            attempts: 0,
            maxAttempts: 12,
            nextAttemptAt: now,
            lastAttemptAt: null,
            responseStatus: null,
            responseBody: null,
            errorMessage: null,
          });
        });

        return { event, deliveryRows };
      })
    );

    const eventRows = rows.map((row) => row.event);
    log.verbose(`Creating ${eventRows.length} new webhook events`);
    await this.events.createAll(eventRows, ctx);

    const deliveryRows = rows.flatMap((row) => row.deliveryRows);
    if (!deliveryRows.length) {
      return;
    }
    log.verbose(`Creating ${deliveryRows.length} new webhook deliveries`);
    await this.deliveries.createAll(deliveryRows, ctx);
  }
}
