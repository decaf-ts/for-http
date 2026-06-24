import { type ModelArg, required } from "@decaf-ts/decorator-validation";
import { maxlength, minlength, model } from "@decaf-ts/decorator-validation";
import { column, index, OrderDirection, pk, table } from "@decaf-ts/core";
import { description, uses } from "@decaf-ts/decoration";
import { composed } from "@decaf-ts/db-decorators";
import { HLFIdentifiedModel } from "./HLFIdentifiedModel";

@description("Links a product to a specific market.")
@uses("ram")
@table()
@model()
export class ProductMarket extends HLFIdentifiedModel {
  @pk()
  @composed(["productCode", "marketId"], ":", true)
  @description("Unique identifier composed of product code and market ID.")
  id!: string;

  @column()
  @required()
  // @pattern(LocaleHelper.getMarketRegex())
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description(
    "Identifier of the market where the product is registered or sold."
  )
  marketId!: string;

  @column()
  @required()
  productCode!: string;

  @column()
  @minlength(2)
  @maxlength(2)
  @description(
    "Two-letter national code (ISO format) representing the market's country."
  )
  nationalCode?: string;

  @column()
  @description("Name of the Marketing Authorization Holder (MAH).")
  mahName?: string;

  @column()
  @description(
    "Name of the legal entity responsible for the product in this market."
  )
  legalEntityName?: string;

  @column()
  @description(
    "Address of the Marketing Authorization Holder or responsible legal entity."
  )
  mahAddress?: string;

  constructor(model?: ModelArg<ProductMarket>) {
    super(model);
  }
}
