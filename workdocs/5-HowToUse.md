### How to Use

- [Initial Setup](./tutorials/For%20Developers.md#_initial-setup_)
- [Installation](./tutorials/For%20Developers.md#installation)

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
