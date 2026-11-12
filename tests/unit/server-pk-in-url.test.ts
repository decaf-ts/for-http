import { it } from "@decaf-ts/for-testing";
import { BaseModel, column, pk, table } from "@decaf-ts/core";
import { model } from "@decaf-ts/decorator-validation";
import { BadRequestError, composed } from "@decaf-ts/db-decorators";
import { ModelControllerBuilder } from "../../src/server/controllers/ModelControllerBuilder";
import { ModelControllerFactory } from "../../src/server/controllers/ModelControllerFactory";

@table("pk_url_items")
@model()
class PkItem extends BaseModel {
  @pk()
  id!: string;

  @column()
  name!: string;
}

@table("pk_url_composed")
@model()
class PkComposed extends BaseModel {
  @pk()
  @composed(["code", "market"], ":", true)
  id!: string;

  @column()
  code!: string;

  @column()
  market!: string;
}

/** persistence stub echoing what it receives */
const echo = {
  create: async (m: any) => ({ op: "create", model: m }),
  update: async (m: any) => ({ op: "update", model: m }),
};

function route(builder: ModelControllerBuilder<any>, method: string) {
  const routes = (builder as any).controller.methods;
  return routes.find((r: any) => r.method === method);
}

describe("server: primary key in the URL (idInUrl)", () => {
  it("creates on the collection by default (REST)", async () => {
    const builder = new ModelControllerBuilder(PkItem, echo as any).addCreateRoute();
    const create = route(builder, "POST");
    expect(create.path).toBe("");
    const res = await create.implementation.call({}, new PkItem({ id: "a", name: "A" }));
    expect(res.model.id).toBe("a");
  });

  it("with idInUrl the create route carries the pk and it must match the payload", async () => {
    const builder = new ModelControllerBuilder(PkItem, echo as any).addCreateRoute(true);
    const create = route(builder, "POST");
    expect(create.path).toBe(":id");

    const ok = await create.implementation.call({}, { id: "a", name: "A" }, "a");
    expect(ok.model).toBeInstanceOf(PkItem);
    expect(ok.model.id).toBe("a");

    const filled = await create.implementation.call({}, { name: "A" }, "b");
    expect(filled.model.id).toBe("b");

    expect(() => create.implementation.call({}, { id: "a", name: "A" }, "z")).toThrow(
      BadRequestError
    );
  });

  it("update always carries the pk, which must match the payload", async () => {
    const builder = new ModelControllerBuilder(PkItem, echo as any).addUpdateRoute();
    const update = route(builder, "PUT");
    expect(update.path).toBe(":id");

    const ok = await update.implementation.call({}, { id: "a", name: "B" }, "a");
    expect(ok.model.id).toBe("a");
    const filled = await update.implementation.call({}, { name: "B" }, "a");
    expect(filled.model.id).toBe("a");
    expect(() => update.implementation.call({}, { id: "x", name: "B" }, "a")).toThrow(
      /id in the URL \(a\) does not match the payload \(x\)/
    );
  });

  it("matches every part of a composed pk, and the composed key itself", async () => {
    const builder = new ModelControllerBuilder(PkComposed, echo as any)
      .addCreateRoute(true)
      .addUpdateRoute();
    const create = route(builder, "POST");
    const update = route(builder, "PUT");
    expect(create.path).toBe(":code/:market");

    const ok = await create.implementation.call({}, { code: "C1", market: "PT" }, "C1", "PT");
    expect(ok.model.code).toBe("C1");
    expect(() =>
      create.implementation.call({}, { code: "C1", market: "ES" }, "C1", "PT")
    ).toThrow(/market in the URL \(PT\) does not match the payload \(ES\)/);

    const updated = await update.implementation.call({}, { code: "C1" }, "C1", "PT");
    expect(updated.model.market).toBe("PT");
    expect(updated.model.id).toBe("C1:PT");
    expect(() =>
      update.implementation.call({}, { id: "C2:PT", code: "C1", market: "PT" }, "C1", "PT")
    ).toThrow(/id in the URL \(C1:PT\) does not match the payload \(C2:PT\)/);
  });

  it("the factory honours the idInUrl config", () => {
    const routesOf = (cfg?: any) =>
      ((ModelControllerFactory.create(PkItem, echo, cfg) as any).__routes__ as any[])
        .filter((r) => r.method === "POST")
        .map((r) => r.path);
    expect(routesOf()).toContain("");
    expect(routesOf()).not.toContain(":id");
    expect(routesOf({ idInUrl: true })).toContain(":id");
    expect(routesOf({ idInUrl: true })).not.toContain("");
  });
});
