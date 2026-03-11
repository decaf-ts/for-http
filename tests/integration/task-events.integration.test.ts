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
import { OperationKeys } from "@decaf-ts/db-decorators";

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

describe("TaskModel HTTP integration with SSE", () => {
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

    source = new EventSourcePlus(`http://${host}/events`, {
      headers: { Accept: "text/event-stream" },
    });
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

  const buildTask = (overrides: Partial<TaskModel> = {}) =>
    new TaskModel({
      classification:
        overrides.classification ??
        `http-task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name:
        overrides.name ?? `http-task-${Math.random().toString(36).slice(2, 6)}`,
      maxAttempts: overrides.maxAttempts ?? 3,
      backoff: overrides.backoff ?? new TaskBackoffModel(),
      ...overrides,
    });

  it("performs CRUD operations via HTTP", async () => {
    const created = await taskRepo.create(
      buildTask({ classification: "crud-http" })
    );
    expect(created.id).toBeDefined();

    const read = await taskRepo.read(created.id);
    expect(read.classification).toBe("crud-http");

    read.status = TaskStatus.RUNNING;
    const updated = await taskRepo.update(read);
    expect(updated.status).toBe(TaskStatus.RUNNING);

    await taskRepo.delete(updated.id);
    await expect(taskRepo.read(updated.id)).rejects.toThrow();
  });

  it("supports query, pagination, and bulk via HTTP", async () => {
    const batch = await taskRepo.createAll([
      buildTask({ classification: "bulk-http-1" }),
      buildTask({ classification: "bulk-http-2" }),
    ]);
    expect(batch).toHaveLength(2);

    const listed = await taskRepo.listBy("createdAt", OrderDirection.ASC);
    expect(listed.length).toBeGreaterThanOrEqual(2);

    const paged = await taskRepo.paginateBy("createdAt", OrderDirection.ASC, {
      offset: 1,
      limit: 1,
    });
    expect(paged.data.length).toBe(1);

    const found = await taskRepo.find("bulk-http", OrderDirection.ASC);
    expect(found.length).toBeGreaterThanOrEqual(2);

    const pageResult = await taskRepo.page("bulk-http", OrderDirection.ASC, {
      offset: 1,
      limit: 1,
    });
    expect(pageResult.data.length).toBe(1);

    batch[0].status = TaskStatus.SUCCEEDED;
    batch[1].status = TaskStatus.FAILED;
    const updated = await taskRepo.updateAll(batch);
    expect(updated.map((t) => t.status)).toEqual(
      expect.arrayContaining([TaskStatus.SUCCEEDED, TaskStatus.FAILED])
    );

    await taskRepo.deleteAll(updated.map((t) => t.id));
  });

  it("streams task persistence events while tracking statuses", async () => {
    const task = await taskRepo.create(
      buildTask({ classification: "obs-http" })
    );
    const running = await taskRepo.update({
      ...task,
      status: TaskStatus.RUNNING,
    });
    await taskRepo.update({ ...running, status: TaskStatus.SUCCEEDED });

    await eventRepo.create(
      new TaskEventModel({
        taskId: task.id,
        classification: TaskEventType.STATUS,
        payload: { status: TaskStatus.SUCCEEDED },
      })
    );

    await waitForEvents(
      () =>
        collected.some(
          (evt) =>
            Array.isArray(evt) &&
            evt[0] === "TaskModel" &&
            evt[1] === OperationKeys.CREATE
        ),
      4000
    );

    expect(
      collected.some(
        (evt) =>
          Array.isArray(evt) &&
          evt[0] === "TaskEventModel" &&
          evt[1] === OperationKeys.CREATE
      )
    ).toBe(true);
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
