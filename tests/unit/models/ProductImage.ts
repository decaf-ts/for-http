import { description, uses } from "@decaf-ts/decoration";
import { column, pk, table } from "@decaf-ts/core";
import { model, type ModelArg, required } from "@decaf-ts/decorator-validation";
import { HLFIdentifiedModel } from "./HLFIdentifiedModel";

@description("Links a product to a specific market.")
@uses("ram")
@table()
@model()
export class ProductImage extends HLFIdentifiedModel {
  @pk()
  @description("Unique identifier composed of product code and market ID.")
  productCode!: string;

  @column()
  @required()
  @description("image content in base64")
  content!: string;

  constructor(model?: ModelArg<ProductImage>) {
    super(model);
  }
}
