import {
  Adapter,
  ClauseFactory,
  Condition,
  Sequence,
  SequenceOptions,
  Statement,
  User,
} from "@decaf-ts/core";
import { BaseError, InternalError } from "@decaf-ts/db-decorators";
import { HttpConfig } from "./types";

export abstract class HttpAdapter<Y, C, Q = unknown> extends Adapter<Y, Q> {
  protected constructor(
    native: Y,
    protected config: HttpConfig,
    flavour: string = "http"
  ) {
    super(native, flavour);
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  parseCondition(condition: Condition): Q {
    throw new InternalError(
      "Api is not natively available for HttpAdapters. If required, please extends this class"
    );
  }
  get Statement(): Statement<Q> {
    throw new InternalError(
      "Api is not natively available for HttpAdapters. If required, please extends this class"
    );
  }
  get Clauses(): ClauseFactory<Y, Q> {
    throw new InternalError(
      "Api is not natively available for HttpAdapters. If required, please extends this class"
    );
  }
  protected parseError(err: Error): BaseError {
    throw new Error("Method not implemented.");
  }
  initialize(...args: any[]): Promise<void> {
    throw new Error("Method not implemented.");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Sequence(options: SequenceOptions): Promise<Sequence> {
    throw new InternalError(
      "Api is not natively available for HttpAdapters. If required, please extends this class"
    );
  }
  protected user(): Promise<User> {
    throw new InternalError(
      "Api is not natively available for HttpAdapters. If required, please extends this class"
    );
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
    throw new InternalError(
      "Api is not natively available for HttpAdapters. If required, please extends this class"
    );
  }
}
