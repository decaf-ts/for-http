import { RepositoryFlags } from "@decaf-ts/db-decorators";

export type HttpConfig = {
  protocol: "http" | "https";
  host: string;
};

export interface HttpFlags extends RepositoryFlags {
  headers?: Record<string, string>;
}
