import {
  Condition,
  ContextOf,
  GroupOperator,
  MaybeContextualArg,
  Operator,
  Paginator,
  QueryClause,
  QueryError,
  Statement,
} from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { HttpAdapter } from "./adapter";
import { toCamelCase } from "@decaf-ts/logging";
import { HttpQuery } from "./types";
import { HttpPaginator } from "./HttpPaginator";
import { InternalError } from "@decaf-ts/db-decorators";

export class HttpStatement<
  M extends Model,
  A extends HttpAdapter<any, any, any, any, any>,
  R,
> extends Statement<
  M,
  A,
  R,
  A extends HttpAdapter<any, any, any, infer Q, any> ? Q : never
> {
  constructor(adapter: A) {
    super(adapter);
  }

  protected build(): A extends HttpAdapter<any, any, any, infer Q, any>
    ? Q
    : never {
    const method: string[] = [QueryClause.FIND_BY];
    const args: (string | number)[] = [];
    const params: Record<"limit" | "skip", any> = {} as any;

    if (this.whereCondition) {
      const parsed = this.parseCondition(this.whereCondition);
      method.push(parsed.method);
      if (parsed.args && parsed.args.length)
        args.push(...(parsed.args as (string | number)[]));
    }
    if (this.selectSelector)
      method.push(
        QueryClause.SELECT,
        this.selectSelector.join(` ${QueryClause.AND.toLowerCase()} `)
      );
    if (this.orderBySelector)
      method.push(QueryClause.ORDER_BY, ...(this.orderBySelector as string[]));
    if (this.groupBySelector)
      method.push(QueryClause.GROUP_BY, this.groupBySelector as string);
    if (this.limitSelector) params.limit = this.limitSelector;
    if (this.offsetSelector) {
      params.skip = this.offsetSelector;
    }
    return {
      class: this.fromSelector,
      method: toCamelCase(method.join(" ")),
      args: args,
      params: Object.keys(params).length ? params : undefined,
    } as A extends HttpAdapter<any, any, any, infer Q, any> ? Q : never;
  }

  async paginate(
    size: number = 10,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<
    Paginator<
      M,
      R,
      A extends HttpAdapter<any, any, any, infer Q, any> ? Q : never
    >
  > {
    try {
      const query = this.build();
      return new HttpPaginator<M, A>(
        this.adapter as A,
        query,
        size,
        this.fromSelector
      ) as any;
    } catch (e: any) {
      throw new InternalError(e);
    }
  }

  protected parseCondition(
    condition: Condition<M>
  ): A extends HttpAdapter<any, any, any, infer Q, any> ? Q : never {
    // @ts-expect-error accessing protected properties
    // eslint-disable-next-line prefer-const
    let { attr1, operator, comparison } = condition;

    const result: HttpQuery = {} as any;
    switch (operator) {
      case GroupOperator.AND:
      case GroupOperator.OR: {
        let side1: string = attr1 as string,
          side2: string = comparison as any;
        if (typeof attr1 !== "string") {
          const condition1 = this.parseCondition(attr1 as Condition<any>);
          side1 = condition1.method as string;
          result.args = [...(result.args || []), ...(condition1.args || [])];
        }

        if (comparison instanceof Condition) {
          const condition2 = this.parseCondition(comparison);
          side2 = condition2.method as string;
          result.args = [...(result.args || []), ...(condition2.args || [])];
        }

        result.method = `${side1} ${operator.toLowerCase()} ${side2}`;
        break;
      }
      case Operator.EQUAL:
        result.method = attr1 as string;
        result.args = [...(result.args || []), comparison];
        break;
      case Operator.DIFFERENT:
        result.method = `${attr1} diff`;
        result.args = [...(result.args || []), comparison];
        break;
      case Operator.REGEXP:
        result.method = `${attr1} matches`;
        result.args = [...(result.args || []), comparison];
        break;
      case Operator.BIGGER:
        result.method = `${attr1} bigger`;
        result.args = [...(result.args || []), comparison];
        break;
      case Operator.BIGGER_EQ:
        result.method = `${attr1} bigger than equal`;
        break;
      case Operator.SMALLER:
        result.method = `${attr1} less`;
        result.args = [...(result.args || []), comparison];
        break;
      case Operator.SMALLER_EQ:
        result.method = `${attr1} less than equal`;
        result.args = [...(result.args || []), comparison];
        break;
      case Operator.IN:
        result.method = `${attr1} in`;
        result.args = [...(result.args || []), comparison];
        break;
      default:
        throw new QueryError(`Unsupported operator ${operator}`);
    }

    return result as A extends HttpAdapter<any, any, any, infer Q, any>
      ? Q
      : never;
  }
}
