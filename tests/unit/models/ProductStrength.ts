import type { ModelArg } from "@decaf-ts/decorator-validation";
import { model, required } from "@decaf-ts/decorator-validation";
import { column, index, OrderDirection, pk, table } from "@decaf-ts/core";
import { description, uses } from "@decaf-ts/decoration";
import { HLFIdentifiedModel } from "./HLFIdentifiedModel";

@uses("ram")
@table()
@model()
@description("Represents the product’s strength and composition details.")
export class ProductStrength extends HLFIdentifiedModel {
  @pk()
  @description("Represents the product’s strength and composition details.")
  id!: number;

  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Product code associated with this strength entry.")
  productCode!: string;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Product concentration or dosage (e.g., 500mg, 10%).")
  strength!: string;

  @column()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Active substance related to this product strength.")
  substance?: string;

  @column()
  @description("Legal entity name responsible for the product.")
  legalEntityName?: string;

  constructor(model?: ModelArg<ProductStrength>) {
    super(model);
  }
}
