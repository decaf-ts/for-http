import {
  model,
  Model,
  ModelArg,
  required,
  step,
} from "@decaf-ts/decorator-validation";
import { pk } from "@decaf-ts/core";
import { uses } from "@decaf-ts/decoration";

@uses("axios")
@model()
export class TestModel extends Model {
  @pk()
  id!: number;

  @required()
  name!: string;

  @required()
  @step(1)
  age!: number;

  constructor(arg?: ModelArg<TestModel>) {
    super(arg);
  }
}
