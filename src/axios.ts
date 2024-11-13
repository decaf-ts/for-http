import { HttpAdapter } from "./adapter";
import { Axios, AxiosRequestConfig } from "axios";
import { HttpConfig } from "./types";

export class AxiosHttpAdapter extends HttpAdapter<Axios, AxiosRequestConfig> {
  constructor(native: Axios, config: HttpConfig, flavour: string = "axios") {
    super(native, config, flavour);
  }

  override request<V>(details: AxiosRequestConfig): Promise<V> {
    return this.native.request(details);
  }

  create(
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
  read(
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
  update(
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
  delete(
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
