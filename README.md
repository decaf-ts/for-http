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

Minimal size: 4.2 KB kb gzipped


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
