import type { ModelArg } from "@decaf-ts/decorator-validation";
import { model, required } from "@decaf-ts/decorator-validation";
import {
  Cascade,
  column,
  index,
  oneToMany,
  oneToOne,
  OrderDirection,
  pk,
  table,
} from "@decaf-ts/core";
import { description, prop, uses } from "@decaf-ts/decoration";
import { ProductStrength } from "./ProductStrength";
import { ProductMarket } from "./ProductMarket";
import { ProductImage } from "./ProductImage";
import { HLFIdentifiedModel } from "./HLFIdentifiedModel";

// @BlockOperations([OperationKeys.DELETE])
@uses("ram")
@table("product")
@model()
export class Product extends HLFIdentifiedModel {
  @pk()
  @description("the product code")
  productCode!: string;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("the product code")
  inventedName!: string;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("the product code")
  nameMedicinalProduct!: string;

  @column()
  @prop()
  internalMaterialCode?: string;

  @column()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("the product code")
  productRecall: boolean = false;

  @oneToOne(
    () => ProductImage,
    {
      update: Cascade.CASCADE,
      delete: Cascade.CASCADE,
    },
    false
  )
  @description("the product image")
  imageData?: string | ProductImage;
  //
  // @column()
  // flagEnableAdverseEventReporting?: boolean;
  //
  // @column()
  // adverseEventReportingURL?: string;
  //
  // @column()
  // flagEnableACFProductCheck?: boolean;
  //
  // @column()
  // @url()
  // acfProductCheckURL?: string;
  //
  // @column()
  // patientSpecificLeaflet?: string;
  //
  // @column()
  // healthcarePractitionerInfo?: string;
  //
  // @column()
  // counter?: number;

  @oneToMany(
    () => ProductStrength,
    { update: Cascade.CASCADE, delete: Cascade.CASCADE },
    true
  )
  @description("the products strengths")
  strengths!: ProductStrength[];

  @oneToMany(
    () => ProductMarket,
    { update: Cascade.CASCADE, delete: Cascade.CASCADE },
    true
  )
  @description("list of markets for the product")
  markets!: ProductMarket[];

  @description("the owner (msp) of the product")
  owner!: string;

  constructor(args?: ModelArg<Product>) {
    super(args);
  }
}
