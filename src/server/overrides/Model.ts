import "@decaf-ts/decorator-validation";
import { Constructor } from "@decaf-ts/decoration";

declare module "@decaf-ts/decorator-validation" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace Model {
    function hooks<M extends Model>(m: M | Constructor<M>): string[];
  }
}
