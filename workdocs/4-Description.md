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
