![Banner](./workdocs/assets/decaf-logo.svg)

# decaf-ts/for-http

A lightweight HTTP adapter layer for decaf-ts that enables CRUD-style repositories and services over REST APIs. It defines a generic HttpAdapter with concrete implementations (e.g., Axios), a RestService for simple model-centric operations, and a RestRepository when you need repository decoration logic before submitting to the backend. Includes minimal types for configuration and request flags.

> Release docs refreshed on 2025-11-26. See [workdocs/reports/RELEASE_NOTES.md](./workdocs/reports/RELEASE_NOTES.md) for ticket summaries.

![Licence](https://img.shields.io/github/license/decaf-ts/for-http.svg?style=plastic)
![GitHub language count](https://img.shields.io/github/languages/count/decaf-ts/for-http?style=plastic)
![GitHub top language](https://img.shields.io/github/languages/top/decaf-ts/for-http?style=plastic)

[![Build & Test](https://github.com/decaf-ts/for-http/actions/workflows/nodejs-build-prod.yaml/badge.svg)](https://github.com/decaf-ts/for-http/actions/workflows/nodejs-build-prod.yaml)
[![CodeQL](https://github.com/decaf-ts/for-http/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/decaf-ts/for-http/actions/workflows/codeql-analysis.yml)[![Snyk Analysis](https://github.com/decaf-ts/for-http/actions/workflows/snyk-analysis.yaml/badge.svg)](https://github.com/decaf-ts/for-http/actions/workflows/snyk-analysis.yaml)
[![Pages builder](https://github.com/decaf-ts/for-http/actions/workflows/pages.yaml/badge.svg)](https://github.com/decaf-ts/for-http/actions/workflows/pages.yaml)
[![.github/workflows/release-on-tag.yaml](https://github.com/decaf-ts/for-http/actions/workflows/release-on-tag.yaml/badge.svg?event=release)](https://github.com/decaf-ts/for-http/actions/workflows/release-on-tag.yaml)

![Open Issues](https://img.shields.io/github/issues/decaf-ts/for-http.svg)
![Closed Issues](https://img.shields.io/github/issues-closed/decaf-ts/for-http.svg)
![Pull Requests](https://img.shields.io/github/issues-pr-closed/decaf-ts/for-http.svg)
![Maintained](https://img.shields.io/badge/Maintained%3F-yes-green.svg)

![Forks](https://img.shields.io/github/forks/decaf-ts/for-http.svg)
![Stars](https://img.shields.io/github/stars/decaf-ts/for-http.svg)
![Watchers](https://img.shields.io/github/watchers/decaf-ts/for-http.svg)

![Node Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fraw.githubusercontent.com%2Fbadges%2Fshields%2Fmaster%2Fpackage.json&label=Node&query=$.engines.node&colorB=blue)
![NPM Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fraw.githubusercontent.com%2Fbadges%2Fshields%2Fmaster%2Fpackage.json&label=NPM&query=$.engines.npm&colorB=purple)

Documentation available [here](https://decaf-ts.github.io/for-http/)

Minimal size: 7.2 KB kb gzipped


# decaf-ts/for-http — Detailed Description

This package provides a small, focused HTTP integration for decaf-ts. It introduces a generic HttpAdapter abstraction that maps REST semantics (create/read/update/delete and bulk variants) onto decaf-ts repositories and services, plus minimal configuration and flags. A ready-to-use Axios adapter is included.

Core goals
- Keep HTTP concerns decoupled from models and repositories.
- Provide a consistent CRUD surface over REST endpoints.
- Allow custom clients (via subclassing HttpAdapter) while shipping an Axios implementation.
- Offer simple configuration (protocol/host) and request-scoped headers via flags/context.

Key building blocks
- HttpConfig: A minimal connection config with protocol and host.
- HttpFlags: Extends RepositoryFlags to include optional HTTP headers.
- HttpAdapter<Y, CON, Q, F, C>:
  - Extends the core Adapter to focus on HTTP.
  - Adds default flags() with headers support.
  - Provides URL building (protected url()) and error parsing (parseError()).
  - Declares abstract request(), create(), read(), update(), delete().
  - Declares optional/unsupported-by-default raw(), Sequence(), Statement(), parseCondition() that concrete adapters may implement if needed.
  - repository() returns RestService as the default repository/service implementation for this adapter type.
- RestService<M, Q, A, F, C>:
  - Lightweight, model-centric service that delegates to the HttpAdapter for CRUD and bulk operations.
  - Converts between model instances and plain records using adapter.prepare() and adapter.revert().
  - Manages a list of observers (observe/unObserve/updateObservers) that can be refreshed after changes.
- RestRepository<M, Q, A, F, C>:
  - A Repository that works with an HttpAdapter; use it if you need decaf-ts repository decoration/logic before sending to the backend.
  - Not the default repository for the HTTP adapter (that role is fulfilled by RestService); intended for cases where repository lifecycle logic matters.
- AxiosHttpAdapter:
  - Concrete implementation of HttpAdapter built on Axios.
  - Implements request and CRUD operations using Axios.request/get/post/put/delete.
  - Uses HttpConfig for base URL construction and inherits header flag behavior.

Flow overview
1. Instantiate a concrete adapter (e.g., AxiosHttpAdapter) with an HttpConfig.
2. Get a repository/service for a given model (the default is RestService via adapter.getRepository(), or instantiate RestService/RestRepository directly).
3. Call CRUD methods (create/read/update/delete) or their bulk equivalents (createAll/readAll/updateAll/deleteAll) on the service or repository. The service:
   - Derives the table/collection name from the model’s decaf-ts metadata.
   - Uses adapter.prepare() to serialize the model and extract its ID.
   - Invokes the adapter’s HTTP methods.
   - Uses adapter.revert() to rehydrate responses back into model instances.
4. Optionally provide HttpFlags (e.g., headers) in the Context to influence requests.

URL building and error handling
- HttpAdapter.url() builds URLs as `${protocol}://${host}/${tableName}` and appends encoded query parameters when provided, ensuring spaces are encoded as %20.
- HttpAdapter.parseError() currently returns the error unchanged (as BaseError) but is intended to be overridden/extended by concrete adapters to normalize HTTP/client errors.

Bulk operations
- RestService implements createAll, readAll, updateAll, deleteAll. These delegate to similarly named adapter methods (which are expected to exist on the base Adapter implementation from @decaf-ts/core), allowing efficient batched operations where supported by the backend.

Unsupported APIs by default
- Some persistence APIs from the core (raw, Sequence, Statement, parseCondition) are not meaningful out of the box for a generic HTTP adapter, so HttpAdapter throws UnsupportedError for them. Concrete adapters targeting specific backends can choose to implement these.

When to use RestService vs RestRepository
- Use RestService by default for straightforward CRUD over REST endpoints.
- Use RestRepository if you need repository-level decoration logic (e.g., hooks, rules) to run on your models before hitting the HTTP layer.

Extending with another HTTP client
- Subclass HttpAdapter and implement request(), create(), read(), update(), delete().
- Override parseError() to translate client-specific errors to your app’s BaseError.
- Optionally implement raw(), Sequence(), Statement(), parseCondition() if your backend/client supports those features.


# How to Use decaf-ts/for-http

Below are concise, non-repeating examples demonstrating how to use each public element of this library. All code samples are valid TypeScript.

Note: Examples assume your models are decorated with decaf-ts metadata (e.g., table names and primary keys) through @decaf-ts/decorator-validation and @decaf-ts/db-decorators. For brevity, model decoration details are omitted.

## Types: HttpConfig and HttpFlags

Description: Define the basic connection configuration and optional per-request headers.

```ts
import { HttpConfig, HttpFlags } from "@decaf-ts/for-http";

const config: HttpConfig = {
  protocol: "https",
  host: "api.example.com",
};

// You can pass headers via flags (typically through a Context)
const flags: HttpFlags = {
  headers: {
    Authorization: "Bearer <token>",
  },
};
```

## Adapter: AxiosHttpAdapter

Description: Ready-to-use HTTP adapter based on Axios. Use it to interact with REST endpoints.

```ts
import { AxiosHttpAdapter } from "@decaf-ts/for-http/axios";
import { HttpConfig } from "@decaf-ts/for-http";

const config: HttpConfig = { protocol: "https", host: "api.example.com" };
const adapter = new AxiosHttpAdapter(config);
```

## Simple request helpers and options

Description: Use adapter-level `get/post/put/delete` helpers for raw endpoint calls with typed request options.

```ts
import { AxiosHttpAdapter } from "@decaf-ts/for-http/axios";
import { HttpConfig, HttpRequestOptions } from "@decaf-ts/for-http";

const config: HttpConfig = { protocol: "https", host: "api.example.com" };
const adapter = new AxiosHttpAdapter(config);

const opts: HttpRequestOptions = {
  timeout: 3000,
  headers: { Authorization: "Bearer <token>" },
  includeCredentials: true, // mapped to axios withCredentials
  validateStatus: (status) => status < 500,
};

const users = await adapter.get("/v1/users", opts);
const created = await adapter.post("/v1/users", { name: "Alice" }, opts);
const updated = await adapter.put("/v1/users/u1", { name: "Alice A." }, opts);
const removed = await adapter.delete("/v1/users/u1", opts);
```

## Service: RestService

Description: Lightweight, model-centric service that delegates CRUD and bulk operations to the adapter.

```ts
import { RestService } from "@decaf-ts/for-http";
import { AxiosHttpAdapter } from "@decaf-ts/for-http/axios";
import { HttpConfig } from "@decaf-ts/for-http";

// Example model (assumes proper decaf-ts decorations elsewhere)
class User {
  id!: string;
  name!: string;
}

const config: HttpConfig = { protocol: "https", host: "api.example.com" };
const adapter = new AxiosHttpAdapter(config);

// Create a service bound to the User model
const users = new RestService<User, any, typeof adapter>(adapter, User);

// Create
const created = await users.create({ id: "u1", name: "Alice" } as User);

// Read
const found = await users.read("u1");

// Update
const updated = await users.update({ id: "u1", name: "Alice Cooper" } as User);

// Delete
const removed = await users.delete("u1");

// Bulk create
const many = await users.createAll([
  { id: "u2", name: "Bob" } as User,
  { id: "u3", name: "Carol" } as User,
]);

// Bulk read
const foundMany = await users.readAll(["u2", "u3"]);

// Bulk update
const updatedMany = await users.updateAll([
  { id: "u2", name: "Bobby" } as User,
  { id: "u3", name: "Caroline" } as User,
]);

// Bulk delete
const removedMany = await users.deleteAll(["u2", "u3"]);
```

## Repository: RestRepository

Description: Use this when you need decaf-ts "repository" decoration logic to run before hitting the HTTP backend.

```ts
import { RestRepository } from "@decaf-ts/for-http";
import { AxiosHttpAdapter } from "@decaf-ts/for-http/axios";
import { HttpConfig } from "@decaf-ts/for-http";

class Product {
  id!: number;
  title!: string;
}

const cfg: HttpConfig = { protocol: "https", host: "store.example.com" };
const http = new AxiosHttpAdapter(cfg);

// Create a repository for Product
const products = new RestRepository<Product, any, typeof http>(http, Product);

// Typical repository interactions
const p = await products.findById(101);
// ... other repository APIs as provided by @decaf-ts/core Repository
```

## Passing headers via flags/context

Description: Supply headers for a specific operation using HttpFlags. These are typically carried inside a Context from @decaf-ts/db-decorators.

```ts
import { Context } from "@decaf-ts/db-decorators";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { AxiosHttpAdapter, AxiosFlags } from "@decaf-ts/for-http/axios";
import { RestService } from "@decaf-ts/for-http";

class User { id!: string; name!: string; }

const adapter = new AxiosHttpAdapter({ protocol: "https", host: "api.example.com" });
const users = new RestService<User, any, typeof adapter>(adapter, User);

// Generate flags for a READ operation (adds an empty headers obj you can override)
const flags = adapter.flags<User>(OperationKeys.READ, User, { headers: { Authorization: "Bearer <token>" } });

// Place flags into a context (shape depends on @decaf-ts/db-decorators; we cast here for example purposes)
const ctx = { flags } as unknown as Context<AxiosFlags>;

// Many decaf-ts operations accept an optional context/flags as the last argument
const user = await users.read("u1", ctx);
```

## Subclassing: Custom HttpAdapter

Description: Implement a custom adapter for a different HTTP client. You must implement request and CRUD methods at minimum.

```ts
import { HttpAdapter, HttpConfig, HttpFlags } from "@decaf-ts/for-http";
import { Context } from "@decaf-ts/db-decorators";

// Hypothetical client types
type MyClient = { request: <T>(config: any) => Promise<T>; get: <T>(url: string) => Promise<T>; post: <T>(url: string, body: any) => Promise<T>; put: <T>(url: string, body: any) => Promise<T>; delete: <T>(url: string) => Promise<T>; };

type MyRequestConfig = { url: string; method: "GET"|"POST"|"PUT"|"DELETE"; data?: any; headers?: Record<string,string>; };

type MyFlags = HttpFlags;

type MyContext = Context<MyFlags>;

class MyHttpAdapter extends HttpAdapter<HttpConfig, MyClient, MyRequestConfig, MyFlags, MyContext> {
  constructor(config: HttpConfig, alias?: string) { super(config, "my-client", alias); }

  protected override getClient(): MyClient {
    // create and return your HTTP client instance
    return {
      request: async <T>(c: any) => ({} as T),
      get: async <T>(url: string) => ({} as T),
      post: async <T>(url: string, body: any) => ({} as T),
      put: async <T>(url: string, body: any) => ({} as T),
      delete: async <T>(url: string) => ({} as T),
    };
  }

  override async request<V>(details: MyRequestConfig): Promise<V> {
    // bridge to your client’s request API
    return this.client.request<V>(details);
  }

  async create(table: string, id: string|number, model: Record<string, any>): Promise<Record<string, any>> {
    const url = this.url(table);
    return this.client.post(url, model);
  }

  async read(table: string, id: string|number|bigint): Promise<Record<string, any>> {
    const url = this.url(table, { id: id as string|number });
    return this.client.get(url);
  }

  async update(table: string, id: string|number, model: Record<string, any>): Promise<Record<string, any>> {
    const url = this.url(table);
    return this.client.put(url, model);
  }

  async delete(table: string, id: string|number|bigint): Promise<Record<string, any>> {
    const url = this.url(table, { id: id as string|number });
    return this.client.delete(url);
  }

  // Optionally override parseError(err) to normalize client-specific errors
}
```

## Task Engine & Migration tips

`HttpAdapter` instances slot into `MigrationService.migrateAdapters` just like any other adapter. Provide per-flavour handlers when running migrations so the system can persist the last seen version (a file, another database, or a remote endpoint). When `taskMode` is enabled, spin up a separate `RamAdapter` for the `TaskService` (its alias must never match a migrating adapter), then call `MigrationService.migrateAdapters([...], { taskMode: true, taskService, handlers: {...}})` and use `migration.track()` to wait on each version.

```ts
const handlers = {
  http: {
    async retrieveLastVersion() {
      return await versionStore.read("http");
    },
    async setCurrentVersion(version: string) {
      await versionStore.write("http", version);
    },
  },
};

const migrations = await MigrationService.migrateAdapters([httpAdapter], {
  flavours: ["http"],
  toVersion: "1.1.0",
  taskMode: true,
  taskService,
  handlers,
});
for (const migration of migrations) {
  await migration.track();
}
```

`setCurrentVersion` runs after every fully applied version (once at the end when running inline, immediately after each tracked task in `taskMode`), so the recorded `currentVersion` always equals the last completed hop and `retrieveLastVersion` can skip it on restart. Failures leave the version unchanged; call `MigrationService.retry(taskId)` to reset the `TaskModel` to `PENDING`, clear the error/lease metadata, and rerun the pending version without touching already finished ones.

Control ordering through `@migration`: the `reference` string is your log-level semver label, `precedence` lets you force ordering between migrations sharing the same version/flavour, `flavour` restricts execution to specific adapters, and `rules` are async predicates that can skip a migration when its prerequisites are missing.

## Webhook Engine

The webhook engine is a complete publish/subscribe system that delivers HTTP notifications to external endpoints when model data changes. It supports topic-based subscriptions, HMAC-SHA256 payload signing, exponential backoff retries, and two delivery modes (polling and synchronous).

### Architecture Overview

```
Model Change (create/update/delete)
        │
        ▼
   Adapter Observer
        │
        ▼
  WebhookObserver (filters by topic)
        │
        ▼
  WebhookPublisherService
        │
        ├── Creates WebhookEventRecord (one per change)
        └── Creates WebhookDelivery rows (one per matching subscription)
              │
              ▼
        WebhookDeliveryService
              │
    ┌─────────┴──────────┐
    │ POLLING mode        │ SYNCHRONOUS mode
    │ pollLoop → tick →   │ refresh() → processMany()
    │ processBatch()      │ (immediate delivery)
    └────────────────────┘
              │
              ▼
        processOne() → HTTP POST to subscription URL
              │
              ├── Success → status=COMPLETED
              └── Failure → status=FAILED, schedule retry
```

### Models

Three persistence models store the webhook state. All use UUID primary keys and are decorated with standard decaf-ts column/index/table decorators.

#### WebhookSubscription (`webhook_subscriptions` table)

Represents an external endpoint subscribed to one or more topics.

| Field       | Type          | Required | Description                                               |
|-------------|---------------|----------|-----------------------------------------------------------|
| `id`        | string (UUID) | yes      | Primary key                                               |
| `topic`     | string        | yes      | Topic pattern, e.g. `product.created`, `product.*`, `*.*` |
| `url`       | string        | yes      | Target URL for HTTP POST delivery                         |
| `secret`    | string        | yes      | HMAC secret used to sign payloads                         |
| `active`    | boolean       | yes      | Whether this subscription receives deliveries             |
| `createdAt` | Date          | auto     | Creation timestamp                                        |
| `updatedAt` | Date          | auto     | Last update timestamp                                     |

#### WebhookEventRecord (`webhook_events` table)

Represents a single model change event that may be delivered to multiple subscriptions.

| Field                 | Type            | Required | Description                             |
|-----------------------|-----------------|----------|-----------------------------------------|
| `id`                  | string (UUID)   | yes      | Primary key                             |
| `topic`               | string          | yes      | Full topic, e.g. `product.created`      |
| `model`               | string          | yes      | Model name                              |
| `action`              | string          | yes      | Action: `created`, `updated`, `deleted` |
| `entityId`            | string          | yes      | ID of the changed entity                |
| `payload`             | string (JSON)   | yes      | JSON-serialized `WebhookEnvelope`       |
| `status`              | `WebhookStatus` | yes      | `pending`, `completed`, `failed`        |
| `deliveriesTotal`     | number          | yes      | Total deliveries created                |
| `deliveriesSucceeded` | number          | no       | Count of successful deliveries          |
| `deliveriesFailed`    | number          | no       | Count of permanently failed deliveries  |
| `nextAttemptAt`       | Date            | yes      | Next scheduled delivery attempt         |
| `createdAt`           | Date            | auto     | Creation timestamp                      |
| `updatedAt`           | Date            | auto     | Last update timestamp                   |

#### WebhookDelivery (`webhook_deliveries` table)

Represents a single delivery attempt to one subscription endpoint.

| Field            | Type            | Required | Description                                    |
|------------------|-----------------|----------|------------------------------------------------|
| `id`             | string (UUID)   | yes      | Primary key                                    |
| `eventId`        | string          | yes      | FK to `WebhookEventRecord.id`                  |
| `subscriptionId` | string          | yes      | FK to `WebhookSubscription.id`                 |
| `topic`          | string          | yes      | Delivery topic                                 |
| `targetUrl`      | string          | yes      | Destination URL                                |
| `secret`         | string          | yes      | HMAC secret (copied from subscription)         |
| `attempts`       | number          | yes      | Number of delivery attempts made               |
| `maxAttempts`    | number          | yes      | Maximum retry attempts (default 12)            |
| `nextAttemptAt`  | Date            | yes      | Next scheduled retry                           |
| `lastAttemptAt`  | Date            | no       | Last attempt timestamp                         |
| `responseStatus` | number          | no       | HTTP status code received                      |
| `responseBody`   | string          | no       | Response body (truncated to 50KB)              |
| `errorMessage`   | string          | no       | Error message if failed                        |
| `status`         | `WebhookStatus` | yes      | `pending`, `processing`, `completed`, `failed` |
| `createdAt`      | Date            | auto     | Creation timestamp                             |
| `updatedAt`      | Date            | auto     | Last update timestamp                          |

### Enums

```ts
enum WebhookStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  FAILED = "failed",
  PROCESSING = "processing",
}

enum WebhookDeliveryMode {
  POLLING = "polling",
  SYNCHRONOUS = "synchronous",
}
```

### Decorator: `@hook`

Marks a model for webhook observation. Only models decorated with `@hook` generate webhook events on create/update/delete.

```ts
import { hook } from "@decaf-ts/for-http/hooks";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { Model, model } from "@decaf-ts/decorator-validation";
import { table, pk, column } from "@decaf-ts/core";

@table("products")
@model()
@hook() // defaults to [CREATE, UPDATE, DELETE]
export class Product extends Model {
  @pk() id!: string;
  @column() name!: string;
}

// Limit to specific operations
@hook([OperationKeys.CREATE, OperationKeys.DELETE])
export class AuditLog extends Model {
  @pk() id!: string;
  @column() message!: string;
}
```

The decorator generates topics from the model name and operations:
- `Product` with `[CREATE, UPDATE, DELETE]` → `product.created`, `product.updated`, `product.deleted`
- With `allowWildcard: true` in the config, an additional `product.*` topic is registered

### Topic Matching

Topics follow the `<entity>.<action>` pattern. Subscriptions can use wildcards:

| Subscription Topic | Matches                             |
|--------------------|-------------------------------------|
| `product.created`  | Only `product.created` events       |
| `product.*`        | All events for the `product` entity |
| `*.*`              | All events for all entities         |

### Services

#### WebhookDeliveryService

The core engine that manages the delivery lifecycle. Initialized with a `DeliveryServiceConfig` and an adapter for persistence.

```ts
import { WebhookDeliveryService, WebhookDeliveryMode } from "@decaf-ts/for-http/hooks";
import { AxiosHttpAdapter } from "@decaf-ts/for-http/axios";
import { NanoAdapter } from "@decaf-ts/for-nano";
import { Context } from "@decaf-ts/core";

const deliveryService = new WebhookDeliveryService<NanoAdapter>();

await deliveryService.initialize({
  adapter: NanoAdapter,           // Adapter constructor or instance
  config: { ... },                // Adapter configuration
  httpAdapter: AxiosHttpAdapter,  // For sending HTTP POST to endpoints
  httpConfig: { protocol: "http", host: "localhost:3000" },
  mode: WebhookDeliveryMode.POLLING,
  autoStart: false,               // Don't auto-start the polling loop
  models: [Product],              // Models to observe
  flavours: ["nano"],             // Adapter flavours to observe
  batchSize: 10,                  // Deliveries per batch
  pollIntervalMs: 100,            // Poll interval in ms
  gracefulShutdownMsTimeout: 30_000, // Max wait for in-flight deliveries on shutdown
  allowWildcard: true,            // Register `model.*` topics
  callback: async (adapter) => {  // Optional post-init callback
    await adapter["index"](
      WebhookEventRecord,
      WebhookSubscription,
      WebhookDelivery
    );
  },
}, Context.factory({ operation: "init", headers: {}, overrides: {} }));

// Start the delivery engine
await deliveryService.start(ctx);

// Manually process a batch (useful in tests or manual mode)
const processed = await deliveryService.processBatch(10, ctx);

// Replay a failed event (resets all its deliveries)
await deliveryService.replayEvent(eventId, ctx);

// Graceful shutdown — stops polling, waits for in-flight deliveries
await deliveryService.stop(ctx);
```

**Delivery modes:**
- `POLLING`: A background loop claims and processes due deliveries every `pollIntervalMs`. Suitable for most production setups.
- `SYNCHRONOUS`: Deliveries happen inline during the model operation. The `WebhookDeliveryService` observes model changes directly and calls `processMany()` immediately. No polling loop runs.

**Graceful shutdown:**
- `stop()` sets `polling = false`, aborts the `AbortController` (breaking the poll loop), stops observing model changes, and waits for `running` to become `false`.
- If in-flight deliveries don't finish within `gracefulShutdownMsTimeout` (default 30s), it logs an error and resolves so the process can exit.
- `shutdown()` calls `stop()` first, then shuts down the persistence client.
- The currently executing `processOne()` HTTP POST (10s timeout) is allowed to complete; subsequent deliveries in the batch are skipped.

#### WebhookPublisherService

Creates `WebhookEventRecord` and `WebhookDelivery` rows when a model change occurs. Called internally by `WebhookObserver`; you typically don't interact with it directly, but you can publish custom events:

```ts
import { WebhookPublisherService } from "@decaf-ts/for-http/hooks";

const publisher = new WebhookPublisherService();

await publisher.publish({
  entity: "order",
  action: "created",
  entityId: "order-123",
  payload: { id: "order-123", total: 99.99 },
}, ctx);
```

The publisher:
1. Queries all active subscriptions
2. Matches subscriptions to the event topic
3. Creates a `WebhookEventRecord` (status `PENDING` if matches found, `COMPLETED` otherwise)
4. Creates one `WebhookDelivery` per matching subscription

#### WebhookSubscriptionService

CRUD service for `WebhookSubscription` with convenience methods:

```ts
import { WebhookSubscriptionService } from "@decaf-ts/for-http/hooks";

const subService = new WebhookSubscriptionService();

// Create a subscription (active defaults to true)
const sub = await subService.create({
  topic: "product.*",
  url: "https://example.com/webhooks",
  secret: "my-hmac-secret",
}, ctx);

// List active subscriptions
const active = await subService.list(ctx);

// List all subscriptions (including inactive)
const all = await subService.listAll(ctx);

// Deactivate / reactivate
await subService.deactivate(sub.id, ctx);
await subService.reactivate(sub.id, ctx);
```

### Delivery HTTP Payload

Each delivery sends an HTTP POST to the subscription's `targetUrl` with:

**Headers:**
| Header | Description |
|--------|-------------|
| `content-type` | `application/json` |
| `x-webhook-id` | The event ID |
| `x-webhook-topic` | The topic (e.g. `product.created`) |
| `x-webhook-signature` | HMAC-SHA256 hex digest of the payload body |

**Body:** The JSON-serialized `WebhookEnvelope`:
```json
{
  "id": "evt-uuid",
  "topic": "product.created",
  "entity": "product",
  "action": "created",
  "entityId": "prod-123",
  "occurredAt": "2026-01-01T00:00:00.000Z",
  "payload": { ... }
}
```

### Signature Verification (Receiver Side)

Use `verifyWebhookSignature` to validate incoming webhook deliveries:

```ts
import { verifyWebhookSignature } from "@decaf-ts/for-http/hooks";

const isValid = verifyWebhookSignature(
  subscriptionSecret,  // The shared secret
  rawBody,             // The raw request body string
  signatureHeader      // The x-webhook-signature header value
);
```

Or use the built-in middleware:

```ts
import { WebhookSignatureMiddleware } from "@decaf-ts/for-http/hooks";

const middleware = new WebhookSignatureMiddleware({
  headerNames: {
    signature: "x-webhook-signature",
    webhookId: "x-webhook-id",
    topic: "x-webhook-topic",
  },
  logging: {
    enabled: true,
    level: "info",
    includePayloadHash: true,
  },
});

// In an Express-style handler:
await middleware.verify(req, res, next);
```

The middleware:
1. Extracts the signature from the configured header (supports `hmac-sha256=`, `sha256=`, or raw hex)
2. Looks up the subscription by matching the request URL to `WebhookSubscription.url`
3. Verifies the HMAC-SHA256 signature using `timingSafeEqual` (constant-time comparison)
4. Returns `400` (missing/invalid signature) or `401` (subscription not found / signature mismatch) on failure

### Retry Strategy

Failed deliveries use exponential backoff:

| Attempt | Delay           |
|---------|-----------------|
| 1       | 30s             |
| 2       | 1min            |
| 3       | 2min            |
| 4       | 4min            |
| 5       | 8min            |
| 6       | 16min           |
| ...     | capped at 30min |

After `maxAttempts` (default 12) the delivery is marked `FAILED` permanently. The event status is recalculated after each delivery:
- All deliveries `COMPLETED` → event `COMPLETED`
- Some deliveries still pending/retrying → event `PENDING`
- All deliveries `FAILED` (exhausted retries) → event `FAILED`

### NestJS Integration (for-nest)

In a NestJS application, use `DecafWebhookModule` which auto-generates CRUD controllers for the three webhook models plus action endpoints:

```ts
import { DecafWebhookModule } from "@decaf-ts/for-nest";

@Module({
  imports: [
    await DecafWebhookModule.forRoot({
      conf: [
        [NanoAdapter, nanoConfig, new WebhookRamTransformer()],
      ],
      webhookApiPath: "webhooks", // default
      initialization: async () => { /* optional post-boot logic */ },
      handlers: [MyRequestHandler], // optional DecafRequestHandler[]
    }),
  ],
})
export class AppModule {}
```

This registers:
- **CRUD controllers** for `WebhookSubscription`, `WebhookEventRecord`, and `WebhookDelivery` (auto-generated via `FromModelController`)
- **Action endpoints:**
  - `POST /webhooks/webhook-subscriptions/:id/deactivate` — deactivate a subscription
  - `POST /webhooks/webhook-subscriptions/:id/reactivate` — reactivate a subscription
  - `POST /webhooks/webhook-events/:id/replay` — replay all deliveries for an event
- All routes are prefixed with `webhookApiPath` (default `webhooks`)

### Full Example (Standalone)

```ts
import {
  WebhookDeliveryService,
  WebhookSubscriptionService,
  WebhookDeliveryMode,
  WebhookStatus,
  hook,
} from "@decaf-ts/for-http/hooks";
import { AxiosHttpAdapter } from "@decaf-ts/for-http/axios";
import { NanoAdapter } from "@decaf-ts/for-nano";
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { Context } from "@decaf-ts/core";

// 1. Define a model with @hook
@table("products")
@model()
@hook([OperationKeys.CREATE, OperationKeys.UPDATE, OperationKeys.DELETE])
class Product extends Model {
  @pk() id!: string;
  @column() name!: string;
}

// 2. Set up the delivery service
const deliveryService = new WebhookDeliveryService<NanoAdapter>();
await deliveryService.initialize({
  adapter: NanoAdapter,
  config: nanoConfig,
  httpAdapter: AxiosHttpAdapter,
  httpConfig: { protocol: "http", host: "localhost:9090" },
  mode: WebhookDeliveryMode.POLLING,
  autoStart: true,
  models: [Product],
  flavours: ["nano"],
  batchSize: 10,
  pollIntervalMs: 500,
  gracefulShutdownMsTimeout: 30_000,
  allowWildcard: true,
}, ctx);

// 3. Create a subscription
const subService = new WebhookSubscriptionService();
await subService.create({
  topic: "product.*",
  url: "https://my-app.com/hooks/product",
  secret: "super-secret",
}, ctx);

// 4. Create a product — this triggers a webhook event
const productRepo = Repository.forModel(Product);
await productRepo.create({ id: "p1", name: "Widget" }, ctx);

// 5. The polling loop picks up the delivery and POSTs to the subscription URL
//    (happens automatically when autoStart is true)

// 6. Graceful shutdown
await deliveryService.stop(ctx);
await deliveryService.shutdown(ctx);
```

## Constants and Types (axios)
## Constants and Types (axios)

Description: Utilities specific to the Axios implementation.

```ts
import { AxiosFlavour, AxiosFlags } from "@decaf-ts/for-http/axios";

// AxiosFlavour is the adapter flavour identifier string: "axios"
console.log(AxiosFlavour);

// AxiosFlags is a type alias of HttpFlags; useful for contexts with Axios
const f: AxiosFlags = { headers: { "X-Trace": "1" } };
```


## Coding Principles

- group similar functionality in folders (analog to namespaces but without any namespace declaration)
- one class per file;
- one interface per file (unless interface is just used as a type);
- group types as other interfaces in a types.ts file per folder;
- group constants or enums in a constants.ts file per folder;
- group decorators in a decorators.ts file per folder;
- always import from the specific file, never from a folder or index file (exceptions for dependencies on other packages);
- prefer the usage of established design patters where applicable:
  - Singleton (can be an anti-pattern. use with care);
  - factory;
  - observer;
  - strategy;
  - builder;
  - etc;

## Release Documentation Hooks
Stay aligned with the automated release pipeline by reviewing [Release Notes](./workdocs/reports/RELEASE_NOTES.md) and [Dependencies](./workdocs/reports/DEPENDENCIES.md) after trying these recipes (updated on 2025-11-26).


### Related

[![decaf-ts](https://github-readme-stats.vercel.app/api/pin/?username=decaf-ts&repo=decaf-ts)](https://github.com/decaf-ts/decaf-ts)
[![for-angular](https://github-readme-stats.vercel.app/api/pin/?username=decaf-ts&repo=for-angular)](https://github.com/decaf-ts/for-angular)
[![decorator-validation](https://github-readme-stats.vercel.app/api/pin/?username=decaf-ts&repo=decorator-validation)](https://github.com/decaf-ts/decorator-validation)
[![db-decorators](https://github-readme-stats.vercel.app/api/pin/?username=decaf-ts&repo=db-decorators)](https://github.com/decaf-ts/db-decorators)


### Social

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/decaf-ts/)




#### Languages

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![NodeJS](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![ShellScript](https://img.shields.io/badge/Shell_Script-121011?style=for-the-badge&logo=gnu-bash&logoColor=white)

## Getting help

If you have bug reports, questions or suggestions please [create a new issue](https://github.com/decaf-ts/ts-workspace/issues/new/choose).

## Contributing

I am grateful for any contributions made to this project. Please read [this](./workdocs/98-Contributing.md) to get started.

## Supporting

The first and easiest way you can support it is by [Contributing](./workdocs/98-Contributing.md). Even just finding a typo in the documentation is important.

Financial support is always welcome and helps keep both me and the project alive and healthy.

So if you can, if this project in any way. either by learning something or simply by helping you save precious time, please consider donating.

## License

This project is released under the [MIT License](./LICENSE.md).

By developers, for developers...
