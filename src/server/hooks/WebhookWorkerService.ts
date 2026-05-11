// import { WebhookDeliveryService } from "./DeliveryService";
// import { Injectable, Logger } from "@nestjs/common";
// import { Interval } from "@nestjs/schedule";
// import {
//   ClientBasedService,
//   Context,
//   MaybeContextualArg,
//   service,
//   Service,
// } from "@decaf-ts/core";
// import { InternalError } from "@decaf-ts/db-decorators";
//
export type WebhookWorkerConfig = {
  interval: number;
};
//
// export const DefaultWebWorkerConfig: WebhookWorkerConfig = {
//   interval: 5000,
// };
//
// @service()
// export class WebhookWorkerService extends ClientBasedService<
//   WebhookDeliveryService<any>,
//   WebhookWorkerConfig
// > {
//   private running = false;
//
//   constructor() {
//     super();
//   }
//
//   async initialize(...args: MaybeContextualArg<any>): Promise<{
//     config: WebhookWorkerConfig;
//     client: WebhookDeliveryService<any>;
//   }> {
//     let ctx = args.pop();
//     if (ctx && !(ctx instanceof Context)) {
//       args.push(ctx);
//       ctx = undefined;
//     }
//
//     const cfg = Object.assign(args.shift() || {}, DefaultWebWorkerConfig);
//     return {
//       client: Service.get(
//         WebhookDeliveryService
//       ) as WebhookDeliveryService<any>,
//       config: cfg,
//     };
//   }
//
//   // @Interval(5000)
//   async tick(): Promise<void> {
//     if (this.running) return;
//     this.running = true;
//
//     try {
//       const processed = await this.deliveries.processBatch(50);
//       if (processed > 0) {
//         this.logger.log(`Processed ${processed} webhook deliveries`);
//       }
//     } finally {
//       this.running = false;
//     }
//   }
// }
