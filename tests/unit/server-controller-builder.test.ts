import { ServerControllerBuilder } from "../../src/server/controllers/ControllerBuilder";

class TestControllerBuilder extends ServerControllerBuilder<any> {}

describe("server/controllers/ControllerBuilder", () => {
  it("round-trips an implementation through addMethod().withImplementation()", () => {
    const implementation = jest.fn(() => "ok");
    const builder = new TestControllerBuilder();

    builder
      .addMethod()
      .withMethod("GET")
      .withPath("/ping")
      .withImplementation(implementation)
      .build();

    const routes = (builder as any).methods;
    expect(routes).toHaveLength(1);
    expect(routes[0].implementation).toBe(implementation);
    expect(routes[0].method).toBe("GET");
    expect(routes[0].path).toBe("/ping");
  });

  it("materializes a class whose method invokes the stored implementation", () => {
    const implementation = jest.fn((value: string) => `handled:${value}`);
    const builder = new TestControllerBuilder();

    builder
      .addMethod()
      .withMethod("GET")
      .withPath("/ping")
      .withImplementation(implementation)
      .build();

    const ControllerClass = builder.build() as any;
    const controller = new ControllerClass();

    expect(controller.getPing("value")).toBe("handled:value");
    expect(implementation).toHaveBeenCalledWith("value");
    expect((ControllerClass as any).__routes__).toHaveLength(1);
    expect((ControllerClass as any).__routes__[0].implementation).toBe(
      implementation
    );
  });
});
