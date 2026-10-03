import {
  MaybeContextualArg,
  ModelService,
  OrderDirection,
  service,
  Context,
} from "@decaf-ts/core";
import { WebhookSubscription } from "./models/WebhookSubscription";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { collectPagedResults } from "./utils";

@service(WebhookSubscription)
export class WebhookSubscriptionService extends ModelService<WebhookSubscription> {
  constructor() {
    super(WebhookSubscription);
  }

  override async create(
    model: WebhookSubscription,
    ...args: MaybeContextualArg<any>
  ): Promise<WebhookSubscription> {
    const { ctx, ctxArgs } = (
      await this.logCtx(args, OperationKeys.CREATE, true)
    ).for(this.create);
    model.active = model.active ?? true;
    // Scope the subscription to the authenticated principal so the lifecycle /
    // action routes can enforce ownership (IDOR). The owner is derived from the
    // authenticated principal and is ALWAYS overwritten when a user is bound: a
    // client-supplied `owner` value is never trusted (F5 hardening). Resources
    // created by a request without a user keep `owner` unset (legacy) and are
    // treated as unowned.
    if (typeof ctx?.getOrUndefined === "function") {
      const user = ctx.getOrUndefined("user") as string | undefined;
      if (user) model.owner = user;
    }
    return super.create(model, ...ctxArgs);
  }

  async list(context?: Context<any>): Promise<WebhookSubscription[]> {
    const { ctx } = (await this.logCtx([context], "list", true)).for(
      this.listAll
    );
    return collectPagedResults(
      () =>
        this.repo
          .select()
          .where(this.repo.attr("active").eq(true))
          .orderBy("createdAt", OrderDirection.DSC)
          .thenBy("id", OrderDirection.DSC)
          .paginate(250, ctx),
      250,
      ctx
    );
  }

  async listAll(context?: Context<any>): Promise<WebhookSubscription[]> {
    const { ctx } = (await this.logCtx([context], "list", true)).for(
      this.listAll
    );
    return collectPagedResults(
      () =>
        this.repo
          .select()
          .orderBy("createdAt", OrderDirection.DSC)
          .thenBy("id", OrderDirection.DSC)
          .paginate(250, ctx),
      250,
      ctx
    );
  }

  async deactivate(
    id: string,
    context?: Context<any>
  ): Promise<WebhookSubscription> {
    const { ctx } = (await this.logCtx([context], "deactivate", true)).for(
      this.deactivate
    );
    const current = await this.read(id, ctx);
    current.active = false;
    return this.repo.update(current, ctx);
  }

  async reactivate(
    id: string,
    context?: Context<any>
  ): Promise<WebhookSubscription> {
    const { ctx } = (await this.logCtx([context], "reactivate", true)).for(
      this.reactivate
    );
    const current = await this.read(id, ctx);
    current.active = true;
    return this.repo.update(current, ctx);
  }
}
