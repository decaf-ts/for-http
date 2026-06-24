import { Model, type ModelArg } from "@decaf-ts/decorator-validation";
import {
  column,
  createdAt,
  index,
  OrderDirection,
  updatedAt,
} from "@decaf-ts/core";
import { description, uses } from "@decaf-ts/decoration";
import { version } from "@decaf-ts/db-decorators";

@uses("ram")
export class HLFBaseModel extends Model {
  @column()
  @createdAt()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  createdAt!: Date;

  @column()
  @updatedAt()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  updatedAt!: Date;

  @column()
  @version()
  @description("stores the version number")
  version!: number;

  constructor(arg?: ModelArg<HLFBaseModel>) {
    super(arg);
  }
}
