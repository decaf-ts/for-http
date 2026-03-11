import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Adapter, defaultQueryAttr, OrderDirection } from "@decaf-ts/core";
import {
  TaskBackoffModel,
  TaskEventModel,
  TaskEventType,
  TaskModel,
  TaskStatus,
} from "@decaf-ts/core/tasks";
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { EventSourcePlus } from "event-source-plus";
import { AxiosHttpAdapter } from "../../src/axios";
import { RestRepository } from "../../src";
import { DecafModule, DecafExceptionFilter } from "@decaf-ts/for-nest";
import { RamTransformer } from "@decaf-ts/for-nest/ram";
import { uses } from "@decaf-ts/decoration";

RamAdapter.decoration();
uses(RamFlavour)(TaskModel);
uses(RamFlavour)(TaskEventModel);

defaultQueryAttr()(TaskModel.prototype, "classification");
defaultQueryAttr()(TaskModel.prototype, "name");
defaultQueryAttr()(TaskEventModel.prototype, "taskId");
defaultQueryAttr()(TaskEventModel.prototype, "classification");

Adapter.setCurrent(RamFlavour);

const cfg = (address: string) => ({
  protocol: "http",
  host: address,
});

const buildTask = (overrides: Partial<TaskModel> = {}) =>
  new TaskModel({
    classification:
      overrides.classification ??
      `tracker-http-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name:
      overrides.name ??
      `tracker-http-${Math.random().toString(36).slice(2, 6)}`,
    maxAttempts: overrides.maxAttempts ?? 3,
    backoff: overrides.backoff ?? new TaskBackoffModel(),
    atomicity: overrides.atomicity ?? TaskModel.prototype.atomicity,
    ...overrides,
  });

describe("TaskModel/TaskEventModel HTTP observables integration", () => {
  let app: INestApplication;
  let taskRepo: RestRepository<TaskModel, any>;
  let eventRepo: RestRepository<TaskEventModel, any>;
  let source: EventSourcePlus;
  const collected: unknown[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(
      await DecafModule.forRootAsync({
        conf: [[RamAdapter, {}, new RamTransformer()]],
        autoControllers: true,
        autoServices: true,
        observerOptions: { enableObserverEvents: true },
      })
    );
    app.useGlobalFilters(new DecafExceptionFilter());
    const httpServer = await app.listen(0);
    const address =
      typeof httpServer.address === "function"
        ? httpServer.address()
        : undefined;
    const host =
      typeof address === "object" && address && typeof address.port === "number"
        ? address.address === "::"
          ? `127.0.0.1:${address.port}`
          : `${address.address}:${address.port}`
        : "127.0.0.1:0";
    const adapter = new AxiosHttpAdapter(cfg(host));
    taskRepo = new RestRepository(adapter, TaskModel);
    eventRepo = new RestRepository(adapter, TaskEventModel);

    source = new EventSourcePlus(
      `http://${host}/events/TaskModel?model=TaskModel`,
      {
        headers: { Accept: "text/event-stream" },
      }
    );
    source.onmessage = (ev) => {
      if (!ev?.data) return;
      try {
        const parsed = JSON.parse(ev.data);
        const payload = parsed?.data ?? parsed;
        collected.push(Array.isArray(payload) ? payload : [payload]);
      } catch {
        collected.push(ev.data);
      }
    };
  });

  afterAll(async () => {
    source?.close();
    await app.close();
  });

  beforeEach(async () => {
    const [tasks, events] = await Promise.all([
      taskRepo.select().execute(),
      eventRepo.select().execute(),
    ]);
    if (tasks.length) await taskRepo.deleteAll(tasks.map((t) => t.id));
    if (events.length) await eventRepo.deleteAll(events.map((evt) => evt.id));
    collected.length = 0;
  });

  it("performs TaskModel CRUD, query, paging, and bulk work", async () => {
    const created = await taskRepo.create(
      buildTask({ classification: "crud-tracker" })
    );
    expect(created.classification).toBe("crud-tracker");

    const read = await taskRepo.read(created.id);
    expect(read.id).toBe(created.id);

    read.status = TaskStatus.RUNNING;
    const updated = await taskRepo.update(read);
    expect(updated.status).toBe(TaskStatus.RUNNING);

    const batch = await taskRepo.createAll([
      buildTask({ classification: "tracker-bulk-1" }),
      buildTask({ classification: "tracker-bulk-2" }),
    ]);
    expect(batch).toHaveLength(2);

    const listed = await taskRepo.listBy("createdAt", OrderDirection.ASC);
    expect(listed.length).toBeGreaterThanOrEqual(2);

    const paged = await taskRepo.paginateBy("createdAt", OrderDirection.ASC, {
      offset: 1,
      limit: 1,
    });
    expect(paged.data.length).toBe(1);

    const finder = await taskRepo.find("tracker-bulk", OrderDirection.ASC);
    expect(finder.length).toBeGreaterThanOrEqual(2);

    const pageResult = await taskRepo.page("tracker-bulk", OrderDirection.DSC, {
      offset: 1,
      limit: 1,
    });
    expect(pageResult.data.length).toBe(1);

    batch[0].status = TaskStatus.SUCCEEDED;
    batch[1].status = TaskStatus.FAILED;
    const updatedBatch = await taskRepo.updateAll(batch);
    expect(updatedBatch.map((t) => t.status)).toEqual(
      expect.arrayContaining([TaskStatus.SUCCEEDED, TaskStatus.FAILED])
    );

    await taskRepo.deleteAll(updatedBatch.map((t) => t.id));
    await expect(taskRepo.read(created.id)).rejects.toThrow();
  });

  it("validates TaskEventModel sorting and filters for the tracker flow", async () => {
    const tracked = await taskRepo.create(
      buildTask({ classification: "event-tracker" })
    );
    const payloads = [
      new TaskEventModel({
        taskId: tracked.id,
        classification: TaskEventType.STATUS,
        payload: { status: TaskStatus.RUNNING },
      }),
      new TaskEventModel({
        taskId: tracked.id,
        classification: TaskEventType.PROGRESS,
        payload: { detail: "halfway" },
      }),
      new TaskEventModel({
        taskId: tracked.id,
        classification: TaskEventType.STATUS,
        payload: { status: TaskStatus.SUCCEEDED },
      }),
    ];

    const createdEvents = await eventRepo.createAll(payloads);
    expect(createdEvents).toHaveLength(3);

    const listedEvents = await eventRepo.listBy("ts", OrderDirection.DSC);
    expect(listedEvents[0].classification).toBe(TaskEventType.STATUS);

    const foundByTask = await eventRepo.find(tracked.id, OrderDirection.DSC);
    expect(foundByTask.every((evt) => evt.taskId === tracked.id)).toBe(true);

    const findByStatus = await eventRepo.findBy(
      "classification",
      TaskEventType.STATUS
    );
    expect(
      findByStatus.every((evt) => evt.classification === TaskEventType.STATUS)
    ).toBe(true);

    const findOneProgress = await eventRepo.findOneBy(
      "classification",
      TaskEventType.PROGRESS
    );
    expect(findOneProgress?.classification).toBe(TaskEventType.PROGRESS);

    const pageEvents = await eventRepo.page("status", OrderDirection.DSC, {
      offset: 1,
      limit: 2,
    });
    expect(pageEvents.data).not.toHaveLength(0);
  });

  it("streams verbose mock task updates through the observables API (task tracker emulation)", async () => {
    const statusHistory: TaskStatus[] = [];
    const eventHistory: string[] = [];
    const snapshot = () =>
      collected.filter((entry) => Array.isArray(entry)) as [
        unknown,
        unknown,
        unknown,
        any,
      ][];

    const task = await taskRepo.create(
      buildTask({ classification: "tracker-stream" })
    );
    await taskRepo.update({ ...task, status: TaskStatus.RUNNING });
    await taskRepo.update({ ...task, status: TaskStatus.SUCCEEDED });

    await eventRepo.createAll([
      new TaskEventModel({
        taskId: task.id,
        classification: TaskEventType.PROGRESS,
        payload: { detail: "starting" },
      }),
      new TaskEventModel({
        taskId: task.id,
        classification: TaskEventType.STATUS,
        payload: { status: TaskStatus.RUNNING },
      }),
      new TaskEventModel({
        taskId: task.id,
        classification: TaskEventType.PROGRESS,
        payload: { detail: "finishing" },
      }),
      new TaskEventModel({
        taskId: task.id,
        classification: TaskEventType.STATUS,
        payload: { status: TaskStatus.SUCCEEDED, output: { ok: true } },
      }),
    ]);

    await waitForEvents(() => {
      const snapshotEvents = snapshot();
      statusHistory.length = 0;
      eventHistory.length = 0;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      snapshotEvents.forEach(([model, op, , payload]) => {
        if (model === TaskModel || (model as any)?.name === TaskModel.name) {
          if (payload?.status) {
            statusHistory.push(payload.status);
          }
        }
        if (
          model === TaskEventModel ||
          (model as any)?.name === TaskEventModel.name
        ) {
          eventHistory.push(`${payload?.classification ?? "unknown"}`);
        }
      });
      return (
        statusHistory.includes(TaskStatus.RUNNING) &&
        statusHistory.includes(TaskStatus.SUCCEEDED) &&
        eventHistory.includes(TaskEventType.STATUS) &&
        eventHistory.includes(TaskEventType.PROGRESS)
      );
    }, 5000);

    expect(statusHistory).toEqual(
      expect.arrayContaining([TaskStatus.RUNNING, TaskStatus.SUCCEEDED])
    );
    expect(eventHistory).toEqual(
      expect.arrayContaining([TaskEventType.PROGRESS, TaskEventType.STATUS])
    );
  });
});

async function waitForEvents(predicate: () => boolean, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for events");
}
