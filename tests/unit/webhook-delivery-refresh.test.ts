import { it } from "@decaf-ts/for-testing";
import { Context } from "@decaf-ts/core";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { WebhookDeliveryService } from "../../src/server/hooks/DeliveryService";
import { WebhookStatus } from "../../src/server/hooks/constants";
import { WebhookDelivery } from "../../src/server/hooks/models/WebhookDelivery";
import { WebhookEventRecord } from "../../src/server/hooks/models/WebhookEventRecord";

const delivery = (id: string, status: WebhookStatus, attempts = 1) =>
  Object.assign(new WebhookDelivery(), {
    id,
    eventId: "event-1",
    status,
    attempts,
    maxAttempts: 3,
    nextAttemptAt: new Date(),
  });

/**
 * Wires stub repositories into the service: `indexed` is what an index query returns
 * (possibly stale), `stored` is what a read by id returns (the latest state).
 */
function serviceWith(
  indexed: WebhookDelivery[],
  stored: Record<string, WebhookDelivery>
) {
  const service = new WebhookDeliveryService<any>();
  const savedEvents: WebhookEventRecord[] = [];
  const statement: any = {
    where: () => statement,
    orderBy: () => statement,
    thenBy: () => statement,
    paginate: async () => ({ page: async () => indexed }),
  };
  const deliveries = {
    select: () => statement,
    attr: () => ({ eq: () => ({}) }),
    read: async (id: string) => {
      if (!stored[id]) throw new NotFoundError(`delivery ${id} not found`);
      return stored[id];
    },
  };
  const events = {
    read: async (id: string) =>
      Object.assign(new WebhookEventRecord(), {
        id,
        status: WebhookStatus.PENDING,
      }),
    update: async (event: WebhookEventRecord) => {
      savedEvents.push(event);
      return event;
    },
  };
  // the service is a singleton, so each test replaces the stubs of the previous one
  for (const [key, value] of Object.entries({ deliveries, events }))
    Object.defineProperty(service, key, {
      value,
      configurable: true,
      writable: true,
    });
  return { service, savedEvents };
}

const refresh = (service: WebhookDeliveryService<any>) =>
  service["refreshEventStatus"]("event-1", new Context());

describe("WebhookDeliveryService.refreshEventStatus", () => {
  it("computes the event status from the latest delivery state, not a stale index read", async () => {
    // the index still answers with the state before the delivery succeeded
    const { service, savedEvents } = serviceWith(
      [delivery("d-1", WebhookStatus.PROCESSING, 0)],
      { "d-1": delivery("d-1", WebhookStatus.COMPLETED) }
    );

    await refresh(service);

    expect(savedEvents).toHaveLength(1);
    expect(savedEvents[0].status).toBe(WebhookStatus.COMPLETED);
    expect(savedEvents[0].deliveriesSucceeded).toBe(1);
  });

  it("keeps the event pending while a delivery is still pending", async () => {
    const { service, savedEvents } = serviceWith(
      [
        delivery("d-1", WebhookStatus.COMPLETED),
        delivery("d-2", WebhookStatus.PENDING, 0),
      ],
      {
        "d-1": delivery("d-1", WebhookStatus.COMPLETED),
        "d-2": delivery("d-2", WebhookStatus.PENDING, 0),
      }
    );

    await refresh(service);

    expect(savedEvents[0].status).toBe(WebhookStatus.PENDING);
    expect(savedEvents[0].deliveriesSucceeded).toBe(1);
  });

  it("ignores deliveries deleted after the index read", async () => {
    const { service, savedEvents } = serviceWith(
      [
        delivery("d-1", WebhookStatus.COMPLETED),
        delivery("gone", WebhookStatus.PENDING, 0),
      ],
      { "d-1": delivery("d-1", WebhookStatus.COMPLETED) }
    );

    await refresh(service);

    expect(savedEvents[0].status).toBe(WebhookStatus.COMPLETED);
  });

  it("propagates read failures other than not found", async () => {
    const { service } = serviceWith(
      [delivery("d-1", WebhookStatus.COMPLETED)],
      {}
    );
    (service.deliveries as any).read = async () => {
      throw new Error("connection reset");
    };

    await expect(refresh(service)).rejects.toThrow("connection reset");
  });
});
