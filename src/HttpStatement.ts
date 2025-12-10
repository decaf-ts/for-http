import {
  Condition,
  GroupOperator,
  Operator,
  Paginator,
  QueryClause,
  QueryError,
  Statement,
  UnsupportedError,
} from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { HttpAdapter } from "./adapter";
import { toCamelCase } from "@decaf-ts/logging";
import { HttpQuery } from "./types";

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

    if (this.whereCondition)
      method.push(this.parseCondition(this.whereCondition));
    if (this.selectSelector)
      method.push(
        QueryClause.SELECT,
        this.selectSelector.join(QueryClause.AND)
      );
    if (this.orderBySelector)
      method.push(QueryClause.ORDER_BY, ...(this.orderBySelector as string[]));
    if (this.groupBySelector)
      method.push(QueryClause.GROUP_BY, this.groupBySelector as string);
    if (this.offsetSelector) {
      params.skip = this.offsetSelector;
    }
    if (this.limitSelector) params.limit = this.limitSelector;
    return {
      class: this.fromSelector,
      method: toCamelCase(method.join(" ")),
      args: args,
      params: Object.keys(params).length ? params : undefined,
    } as A extends HttpAdapter<any, any, any, infer Q, any> ? Q : never;
  }

  paginate(
    size: number,
    args: any
  ): Promise<
    Paginator<
      M,
      R,
      A extends HttpAdapter<any, any, any, infer Q, any> ? Q : never
    >
  > {
    throw new UnsupportedError("cannot paginate yet");
  }

  protected parseCondition(
    condition: Condition<M>
  ): A extends HttpAdapter<any, any, any, infer Q, any> ? Q : never {
    // @ts-expect-error accessing protected properties
    const { attr1, operator, comparison } = condition;

    const result: HttpQuery = {} as any;
    switch (operator) {
      case GroupOperator.AND:
      case GroupOperator.OR: {
        const side1: string =
          typeof attr1 === "string"
            ? attr1
            : this.parseCondition(attr1 as Condition<any>).method;
        const side2: string =
          comparison instanceof Condition
            ? this.parseCondition(comparison as Condition<any>).method
            : comparison;
        result.method = `${side1} ${operator} ${side2}`;
        break;
      }
      case Operator.EQUAL:
        result.method = attr1 as string;
        break;
      case Operator.DIFFERENT:
        result.method = `${attr1} diff`;
        break;
      case Operator.REGEXP:
        result.method = `${attr1} matches`;
        break;
      case Operator.BIGGER:
        result.method = `${attr1} bigger`;
        break;
      case Operator.BIGGER_EQ:
        result.method = `${attr1} bigger than equal`;
        break;
      case Operator.SMALLER:
        result.method = `${attr1} less`;
        break;
      case Operator.SMALLER_EQ:
        result.method = `${attr1} less than equal`;
        break;
      case Operator.IN:
        result.method = `${attr1} in`;
        break;
      default:
        throw new QueryError(`Unsupported operator ${operator}`);
    }

    return result as A extends HttpAdapter<any, any, any, infer Q, any>
      ? Q
      : never;
  }
}
