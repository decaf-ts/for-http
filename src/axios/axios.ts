import { HttpAdapter } from "../adapter";
import { Axios, AxiosRequestConfig } from "axios";
import { HttpConfig } from "../types";
import { AxiosFlags } from "./types";
import { Context } from "@decaf-ts/db-decorators";
import { AxiosFlavour } from "./constants";

export class AxiosHttpAdapter extends HttpAdapter<
  Axios,
  AxiosRequestConfig,
  AxiosFlags,
  Context<AxiosFlags>
> {
  constructor(native: Axios, config: HttpConfig, alias?: string) {
    super(native as any, config, AxiosFlavour, alias);
  }

  override async request<V>(details: AxiosRequestConfig): Promise<V> {
    return this.native.request(details);
  }

  async create(
    tableName: string,
    id: string | number,
    model: Record<string, any>
  ): Promise<Record<string, any>> {
    try {
      const url = this.url(tableName);
      return this.native.post(url, model);
    } catch (e: any) {
      throw this.parseError(e);
    }
  }
  async read(
    tableName: string,
    id: string | number | bigint
  ): Promise<Record<string, any>> {
    try {
      const url = this.url(tableName, { id: id as string | number });
      return this.native.get(url);
    } catch (e: any) {
      throw this.parseError(e);
    }
  }

  async update(
    tableName: string,
    id: string | number,
    model: Record<string, any>
  ): Promise<Record<string, any>> {
    try {
      const url = this.url(tableName);
      return this.native.put(url, model);
    } catch (e: any) {
      throw this.parseError(e);
    }
  }

  async delete(
    tableName: string,
    id: string | number | bigint
  ): Promise<Record<string, any>> {
    try {
      const url = this.url(tableName, { id: id as string | number });
      return this.native.delete(url);
    } catch (e: any) {
      throw this.parseError(e);
    }
  }

  static decoration() {}
}
