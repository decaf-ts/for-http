import { HttpAdapter } from "./adapter";
import { Axios, AxiosRequestConfig } from "axios";
import { HttpConfig } from "./types";

export class AxiosHttpAdapter extends HttpAdapter<Axios, AxiosRequestConfig> {
  constructor(native: Axios, config: HttpConfig, flavour: string = "axios") {
    super(native as any, config, flavour);
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
}
