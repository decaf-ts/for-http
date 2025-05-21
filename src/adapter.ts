import {
  Adapter,
  ClauseFactory,
  Condition,
  Repository,
  Sequence,
  SequenceOptions,
  Statement,
  UnsupportedError,
} from "@decaf-ts/core";
import {
  BaseError,
  Context,
  InternalError,
  OperationKeys,
  RepositoryFlags,
} from "@decaf-ts/db-decorators";
import { HttpConfig } from "./types";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { RestService } from "./RestService";

export abstract class HttpAdapter<
  Y,
  Q,
  F extends RepositoryFlags,
  C extends Context<F>,
> extends Adapter<Y, Q, F, C> {
  protected constructor(
    native: Y,
    protected config: HttpConfig,
    flavour: string = "http"
  ) {
    super(native, flavour);
  }

  async context<
    M extends Model,
    C extends Context<F>,
    F extends RepositoryFlags,
  >(
    operation:
      | OperationKeys.CREATE
      | OperationKeys.READ
      | OperationKeys.UPDATE
      | OperationKeys.DELETE,
    overrides: Partial<F>,
    model: Constructor<M>
  ): Promise<C> {
    return (await super.context(
      operation,
      Object.assign(
        {
          headers: {},
        },
        overrides
      ),
      model
    )) as unknown as C;
  }

  repository<M extends Model>(): Constructor<
    Repository<M, Q, HttpAdapter<Y, Q, F, C>>
  > {
    return RestService as unknown as Constructor<
      Repository<M, Q, HttpAdapter<Y, Q, F, C>>
    >;
  }

  protected url(
    tableName: string,
    queryParams?: Record<string, string | number>
  ) {
    const url = new URL(
      `${this.config.protocol}://${this.config.host}/${tableName}`
    );
    if (queryParams)
      Object.entries(queryParams).forEach(([key, value]) =>
        url.searchParams.append(key, value.toString())
      );

    return encodeURI(url.toString());
  }

  parseError(err: Error): BaseError {
    const { message } = err;
    switch (message) {
      default:
        return err as BaseError;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async initialize(...args: any[]): Promise<void> {
    // do nothing
  }

  abstract request<V>(details: Q): Promise<V>;

  abstract create(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    ...args: any[]
  ): Promise<Record<string, any>>;

  abstract read(
    tableName: string,
    id: string | number | bigint,
    ...args: any[]
  ): Promise<Record<string, any>>;

  abstract update(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    ...args: any[]
  ): Promise<Record<string, any>>;

  abstract delete(
    tableName: string,
    id: string | number | bigint,
    ...args: any[]
  ): Promise<Record<string, any>>;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  raw<R>(rawInput: Q, process: boolean, ...args: any[]): Promise<R> {
    throw new UnsupportedError(
      "Api is not natively available for HttpAdapters. If required, please extends this class"
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Sequence(options: SequenceOptions): Promise<Sequence> {
    throw new UnsupportedError(
      "Api is not natively available for HttpAdapters. If required, please extends this class"
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  parseCondition(condition: Condition): Q {
    throw new UnsupportedError(
      "Api is not natively available for HttpAdapters. If required, please extends this class"
    );
  }
  get Statement(): Statement<Q> {
    throw new UnsupportedError(
      "Api is not natively available for HttpAdapters. If required, please extends this class"
    );
  }
  get Clauses(): ClauseFactory<Y, Q, typeof this> {
    throw new InternalError(
      "Api is not natively available for HttpAdapters. If required, please extends this class"
    );
  }
}
