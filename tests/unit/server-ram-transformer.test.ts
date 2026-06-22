import { RamTransformer } from "../../src/server";

describe("server/transformers/RamTransformer", () => {
  it("maps the authorization header into UUID and preserves headers", async () => {
    const transformer = new RamTransformer();
    const result = await transformer.from({
      headers: {
        authorization: "Bearer user-123",
        "x-forwarded-for": "127.0.0.1",
      },
    });

    expect(result).toEqual({
      UUID: "user-123",
      headers: {
        authorization: "Bearer user-123",
        "x-forwarded-for": "127.0.0.1",
      },
      overrides: {},
    });
  });

  it("returns headers and overrides when no authorization is present", async () => {
    const transformer = new RamTransformer();
    const result = await transformer.from({
      headers: {
        "x-real-ip": "127.0.0.1",
      },
    });

    expect(result).toEqual({
      headers: {
        "x-real-ip": "127.0.0.1",
      },
      overrides: {},
    });
  });
});
