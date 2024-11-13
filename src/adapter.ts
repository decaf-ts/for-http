import {
  Adapter,
  ClauseFactory,
  Condition,
  Repository,
  Sequence,
  SequenceOptions,
  Statement,
  User,
  UnsupportedError
} from "@decaf-ts/core";
import { BaseError, InternalError } from "@decaf-ts/db-decorators";
import { HttpConfig } from "./types";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { RestService } from "./RestService";

export abstract class HttpAdapter<Y, C, Q = unknown> extends Adapter<Y, Q> {
  protected constructor(
    native: Y,
    protected config: HttpConfig,
    flavour: string = "http"
  ) {
    super(native, flavour);
  }

  repository<M extends Model>(): Constructor<
    Repository<M, Q, HttpAdapter<Y, C, Q>>
  > {
    return RestService as unknown as Constructor<
      Repository<M, Q, HttpAdapter<Y, C, Q>>
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

  protected parseError(err: Error): BaseError {
    const { message } = err;
    switch (message) {
      default:
        return err;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async initialize(...args: any[]): Promise<void> {
    // do nothing
  }

  abstract request<V>(details: C): Promise<V>;

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
  protected user(): Promise<User> {
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
  get Clauses(): ClauseFactory<Y, Q> {
    throw new InternalError(
      "Api is not natively available for HttpAdapters. If required, please extends this class"
    );
  }
}
