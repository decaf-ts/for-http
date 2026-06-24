import { Metadata } from "@decaf-ts/decoration";
import { DBKeys } from "@decaf-ts/db-decorators";
import { Product } from "../../../for-nest/tests/unit/Product";

it("debug: dumps Product metadata", () => {
  console.log("DBKeys.ID:", DBKeys.ID);
  console.log(
    "Metadata.get(Product, DBKeys.ID):",
    Metadata.get(Product, DBKeys.ID)
  );
  const sym = (Metadata as any).Symbol(Product);
  const store = (Metadata as any)._metadata || {};
  const bucket = store[sym];
  if (bucket) {
    console.log("All metadata keys on Product:", Object.keys(bucket));
    for (const k of Object.keys(bucket)) {
      if (
        k.includes("id") ||
        k.includes("Id") ||
        k.includes("pk") ||
        k.includes("PK")
      )
        console.log("  ", k, "=>", JSON.stringify(bucket[k]).slice(0, 200));
    }
  } else {
    console.log("No metadata bucket found for Product");
  }
  expect(true).toBe(true);
});
