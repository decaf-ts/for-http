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
