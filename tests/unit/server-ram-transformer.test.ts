import { RamTransformer } from "../../src/server";
import { Context } from "@decaf-ts/core";

describe("server/transformers/RamTransformer", () => {
  it("maps the context user into UUID", async () => {
    const transformer = new RamTransformer();
    const ctx = new Context();
    ctx.accumulate({ user: "user-123" });

    const result = await transformer.from(ctx);

    expect(result).toEqual({
      UUID: "user-123",
      overrides: {},
    });
  });

  it("returns only overrides when no user is present", async () => {
    const transformer = new RamTransformer();
    const ctx = new Context();

    const result = await transformer.from(ctx);

    expect(result).toEqual({
      overrides: {},
    });
  });
});
