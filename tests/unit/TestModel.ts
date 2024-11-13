import {
  model,
  Model,
  ModelArg,
  required,
  step,
} from "@decaf-ts/decorator-validation";
import { pk, uses } from "@decaf-ts/core";

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
