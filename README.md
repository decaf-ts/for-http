![Banner](./workdocs/assets/Banner.png)

## decaf's Http Module

A TypeScript library for seamless REST API interactions. This module provides a flexible and type-safe way to communicate with HTTP-based services using the repository pattern. It includes adapters for different HTTP clients (with Axios implementation provided), repository and service classes for CRUD operations, and comprehensive type definitions to ensure type safety throughout your API interactions.


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

### Description

The `@decaf-ts/for-http` library provides a robust and type-safe solution for interacting with REST APIs in TypeScript applications. Built on top of the core Decaf framework, it implements the repository pattern to offer a clean and consistent interface for HTTP operations.

#### Architecture

The library is structured around several key components:

1. **HTTP Adapter**: The `HttpAdapter` class serves as the foundation, providing an abstract interface for HTTP operations. It handles URL construction, error parsing, and implements the adapter pattern to work with different HTTP clients.

2. **Axios Implementation**: The library includes a concrete implementation of the HTTP adapter using Axios (`AxiosHttpAdapter`), demonstrating how to integrate with popular HTTP clients.

3. **Repository Pattern**: The `RestRepository` class extends the core Repository class to provide a high-level interface for CRUD operations on REST resources. It works with model classes and handles the mapping between your domain models and API endpoints.

4. **Service Layer**: The `RestService` class offers both individual and bulk CRUD operations, with support for the observer pattern to notify subscribers of changes.

5. **Type Definitions**: Comprehensive type definitions ensure type safety throughout your API interactions, with interfaces like `HttpFlags` and `HttpConfig` providing configuration options.

#### Key Features

- **Type Safety**: Leverages TypeScript's type system to ensure API interactions are type-safe
- **Repository Pattern**: Implements the repository pattern for clean separation of concerns
- **CRUD Operations**: Provides standard create, read, update, and delete operations
- **Bulk Operations**: Supports bulk operations for efficient handling of multiple resources
- **Extensibility**: Designed to be extended with different HTTP client implementations
- **Error Handling**: Includes robust error handling and parsing
- **Observer Pattern**: Implements the observer pattern for reactive programming

This library is ideal for applications that need to interact with REST APIs in a structured, type-safe manner, particularly those already using the Decaf framework.


### How to Use

- [Initial Setup](./workdocs/tutorials/For%20Developers.md#_initial-setup_)
- [Installation](./workdocs/tutorials/For%20Developers.md#installation)

## Basic Usage

### Setting Up an HTTP Adapter with Axios

```typescript
import axios from 'axios';
import { AxiosHttpAdapter } from '@decaf-ts/for-http';

// Create an HTTP configuration
const config = {
  protocol: 'https',
  host: 'api.example.com'
};

// Create an Axios HTTP adapter
const httpAdapter = new AxiosHttpAdapter(axios.create(), config);
```

### Creating a Model Class

```typescript
import { Model } from '@decaf-ts/decorator-validation';

class User extends Model {
  id: string;
  name: string;
  email: string;

  constructor(data?: Partial<User>) {
    super();
    Object.assign(this, data);
  }
}
```

### Using RestRepository for CRUD Operations

```typescript
import { RestRepository } from '@decaf-ts/for-http';

// Create a repository for the User model
const userRepository = new RestRepository(httpAdapter, User);

// Create a new user
const newUser = new User({
  name: 'John Doe',
  email: 'john@example.com'
});
const createdUser = await userRepository.create(newUser);

// Read a user by ID
const user = await userRepository.findById('123');

// Update a user
user.name = 'Jane Doe';
await userRepository.update(user);

// Delete a user
await userRepository.delete('123');
```

### Using RestService for Advanced Operations

```typescript
import { RestService } from '@decaf-ts/for-http';

// Create a service for the User model
const userService = new RestService(httpAdapter, User);

// Create a new user
const newUser = new User({
  name: 'John Doe',
  email: 'john@example.com'
});
const createdUser = await userService.create(newUser);

// Read a user by ID
const user = await userService.read('123');

// Update a user
user.name = 'Jane Doe';
await userService.update(user);

// Delete a user
await userService.delete('123');
```

### Bulk Operations with RestService

```typescript
import { RestService } from '@decaf-ts/for-http';

// Create a service for the User model
const userService = new RestService(httpAdapter, User);

// Create multiple users
const users = [
  new User({ name: 'John Doe', email: 'john@example.com' }),
  new User({ name: 'Jane Doe', email: 'jane@example.com' })
];
const createdUsers = await userService.createAll(users);

// Read multiple users by ID
const userIds = ['123', '456'];
const fetchedUsers = await userService.readAll(userIds);

// Update multiple users
const usersToUpdate = [
  new User({ id: '123', name: 'John Smith' }),
  new User({ id: '456', name: 'Jane Smith' })
];
const updatedUsers = await userService.updateAll(usersToUpdate);

// Delete multiple users
await userService.deleteAll(['123', '456']);
```

### Using the Observer Pattern

```typescript
import { RestService } from '@decaf-ts/for-http';
import { Observer } from '@decaf-ts/core';

// Create a service for the User model
const userService = new RestService(httpAdapter, User);

// Create an observer
const userObserver: Observer<User> = {
  update: (user) => {
    console.log('User updated:', user);
  }
};

// Register the observer
userService.observe(userObserver);

// When operations are performed, observers will be notified
await userService.create(new User({ name: 'John Doe' }));

// Unregister the observer when done
userService.unObserve(userObserver);
```

### Custom HTTP Adapter Implementation

```typescript
import { HttpAdapter } from '@decaf-ts/for-http';
import { HttpConfig, HttpFlags } from '@decaf-ts/for-http';
import { Context } from '@decaf-ts/db-decorators';
import SomeHttpClient from 'some-http-client';

// Create a custom HTTP adapter for a different HTTP client
class CustomHttpAdapter extends HttpAdapter<
  SomeHttpClient,
  any,
  HttpFlags,
  Context<HttpFlags>
> {
  constructor(native: SomeHttpClient, config: HttpConfig, alias?: string) {
    super(native, config, 'custom', alias);
  }

  async request<V>(details: any): Promise<V> {
    return this.native.sendRequest(details);
  }

  async create(tableName: string, id: string | number, model: Record<string, any>): Promise<Record<string, any>> {
    try {
      const url = this.url(tableName);
      return this.native.post(url, model);
    } catch (e: any) {
      throw this.parseError(e);
    }
  }

  async read(tableName: string, id: string | number | bigint): Promise<Record<string, any>> {
    try {
      const url = this.url(tableName, { id: id as string | number });
      return this.native.get(url);
    } catch (e: any) {
      throw this.parseError(e);
    }
  }

  async update(tableName: string, id: string | number, model: Record<string, any>): Promise<Record<string, any>> {
    try {
      const url = this.url(tableName);
      return this.native.put(url, model);
    } catch (e: any) {
      throw this.parseError(e);
    }
  }

  async delete(tableName: string, id: string | number | bigint): Promise<Record<string, any>> {
    try {
      const url = this.url(tableName, { id: id as string | number });
      return this.native.delete(url);
    } catch (e: any) {
      throw this.parseError(e);
    }
  }
}
```

### Using HTTP Flags for Request Configuration

```typescript
import { HttpFlags } from '@decaf-ts/for-http';

// Create custom HTTP flags with headers
const flags: HttpFlags = {
  headers: {
    'Authorization': 'Bearer token123',
    'Content-Type': 'application/json'
  }
};

// Use flags with repository operations
const user = await userRepository.findById('123', { flags });

// Use flags with service operations
const createdUser = await userService.create(newUser, { flags });
```

### Complete Application Example

```typescript
import axios from 'axios';
import { 
  AxiosHttpAdapter, 
  RestRepository, 
  RestService, 
  HttpConfig 
} from '@decaf-ts/for-http';
import { Model } from '@decaf-ts/decorator-validation';

// Define a model
class Product extends Model {
  id: string;
  name: string;
  price: number;

  constructor(data?: Partial<Product>) {
    super();
    Object.assign(this, data);
  }
}

// Configure the HTTP adapter
const config: HttpConfig = {
  protocol: 'https',
  host: 'api.mystore.com'
};

// Create the adapter
const adapter = new AxiosHttpAdapter(axios.create(), config);

// Create a repository
const productRepo = new RestRepository(adapter, Product);

// Create a service
const productService = new RestService(adapter, Product);

// Example application
async function manageProducts() {
  try {
    // Create a new product
    const newProduct = new Product({
      name: 'Smartphone',
      price: 699.99
    });

    const createdProduct = await productRepo.create(newProduct);
    console.log('Created product:', createdProduct);

    // Get all products
    const products = await productRepo.findAll();
    console.log('All products:', products);

    // Update a product
    createdProduct.price = 649.99;
    const updatedProduct = await productService.update(createdProduct);
    console.log('Updated product:', updatedProduct);

    // Delete a product
    await productService.delete(createdProduct.id);
    console.log('Product deleted');

    // Bulk operations
    const bulkProducts = [
      new Product({ name: 'Laptop', price: 1299.99 }),
      new Product({ name: 'Tablet', price: 499.99 })
    ];

    const createdProducts = await productService.createAll(bulkProducts);
    console.log('Created multiple products:', createdProducts);
  } catch (error) {
    console.error('Error managing products:', error);
  }
}

manageProducts();
```


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