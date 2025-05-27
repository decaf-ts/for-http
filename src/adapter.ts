import {
  Adapter,
  Condition,
  Repository,
  Sequence,
  SequenceOptions,
  UnsupportedError,
} from "@decaf-ts/core";
import { BaseError, Context, OperationKeys } from "@decaf-ts/db-decorators";
import { HttpConfig, HttpFlags } from "./types";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { RestService } from "./RestService";
import { Statement } from "@decaf-ts/core";

export abstract class HttpAdapter<
  Y,
  Q,
  F extends HttpFlags = HttpFlags,
  C extends Context<F> = Context<F>,
> extends Adapter<Y, Q, F, C> {
  protected constructor(
    native: Y,
    protected config: HttpConfig,
    flavour: string,
    alias?: string
  ) {
    super(native, flavour, alias);
  }

  override flags<M extends Model>(
    operation:
      | OperationKeys.CREATE
      | OperationKeys.READ
      | OperationKeys.UPDATE
      | OperationKeys.DELETE,
    model: Constructor<M>,
    overrides: Partial<F>
  ) {
    return Object.assign(super.flags<M>(operation, model, overrides), {
      headers: {},
    });
  }

  override repository<M extends Model>(): Constructor<
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

  abstract override create(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    ...args: any[]
  ): Promise<Record<string, any>>;

  abstract override read(
    tableName: string,
    id: string | number | bigint,
    ...args: any[]
  ): Promise<Record<string, any>>;

  abstract override update(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    ...args: any[]
  ): Promise<Record<string, any>>;

  abstract override delete(
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

  override Statement<M extends Model>(): Statement<Q, M, any> {
    throw new UnsupportedError(
      "Api is not natively available for HttpAdapters. If required, please extends this class"
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  parseCondition(condition: Condition<any>): Q {
    throw new UnsupportedError(
      "Api is not natively available for HttpAdapters. If required, please extends this class"
    );
  }
}
