import { type ModelArg } from "@decaf-ts/decorator-validation";
import {
  column,
  createdBy,
  index,
  OrderDirection,
  updatedBy,
} from "@decaf-ts/core";
import { uses } from "@decaf-ts/decoration";
import { HLFBaseModel } from "./HLFBaseModel";

@uses("ram")
export class HLFIdentifiedModel extends HLFBaseModel {
  @column()
  @createdBy()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  createdBy!: string;

  @column()
  @updatedBy()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  updatedBy!: string;

  constructor(arg?: ModelArg<HLFIdentifiedModel>) {
    super(arg);
  }
}
