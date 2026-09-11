import http, { IncomingMessage, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";

export type RecordedRequest = {
  method: string;
  path: string;
  headers: IncomingMessage["headers"];
  body: string;
  at: number;
};

/**
 * How the `/events` stream answers:
 * - `ok`: `200 text/event-stream`, kept open (heartbeats on demand)
 * - `reject`: what for-nest sends when the stream handler throws — `200
 *   text/event-stream`, an `event: error` message, then the response ends
 * - `status`: a plain HTTP error (e.g. a proxy 502 or a 401)
 */
export type StreamMode = "ok" | "reject" | "status";

/**
 * Minimal SSE server reproducing the wire behaviour of for-nest's events
 * module (message framing, heartbeats, subscribe/unsubscribe endpoints and the
 * way Nest reports errors raised inside an `@Sse()` handler).
 */
export class SseTestServer {
  readonly requests: RecordedRequest[] = [];
  readonly streams = new Set<ServerResponse>();
  mode: StreamMode = "ok";
  status = 502;
  /** deliver events only to streams whose correlation id subscribed the model */
  enforceSubscriptions = false;
  /** latency of the unsubscribe endpoint (it deletes the record before replying) */
  unsubscribeDelayMs = 0;
  /** topics per correlation id, as for-nest's ObserverSubscriptionRegistry keeps */
  readonly subscriptions = new Map<string, string[]>();
  private readonly streamCid = new Map<ServerResponse, string | undefined>();
  private server?: http.Server;
  private seq = 0;

  get host(): string {
    return `127.0.0.1:${(this.server!.address() as AddressInfo).port}`;
  }

  streamRequests(): RecordedRequest[] {
    return this.requests.filter(
      (r) => r.method === "GET" && r.path.startsWith("/events")
    );
  }

  posts(path: string): RecordedRequest[] {
    return this.requests.filter((r) => r.method === "POST" && r.path === path);
  }

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => this.handle(req, res));
    await new Promise<void>((resolve) =>
      this.server!.listen(0, "127.0.0.1", resolve)
    );
  }

  private handle(req: IncomingMessage, res: ServerResponse) {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const path = (req.url ?? "").split("?")[0];
      this.requests.push({
        method: req.method ?? "",
        path: req.url ?? "",
        headers: req.headers,
        body,
        at: Date.now(),
      });
      const cid = req.headers["x-correlation-id"] as string | undefined;
      if (req.method === "GET" && path === "/events") return this.stream(res, cid);
      if (req.method === "POST" && path === "/events/subscribe") {
        const topics: string[] = JSON.parse(body || "{}").topics ?? [];
        if (cid) this.subscriptions.set(cid, topics);
        res.writeHead(201, { "content-type": "application/json" });
        return res.end(JSON.stringify({ topics }));
      }
      if (req.method === "POST" && path === "/events/unsubscribe") {
        setTimeout(() => {
          if (cid) this.subscriptions.delete(cid);
          res.writeHead(201, { "content-type": "application/json" });
          res.end(JSON.stringify({ unsubscribed: true }));
        }, this.unsubscribeDelayMs);
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: 404, error: `Cannot ${req.method} ${path}` }));
    });
  }

  private stream(res: ServerResponse, cid?: string) {
    if (this.mode === "status") {
      res.writeHead(this.status, { "content-type": "application/json" });
      return res.end(JSON.stringify({ status: this.status }));
    }
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write("\n");
    if (this.mode === "reject") {
      res.write(
        `event: error\nid: ${++this.seq}\ndata: [ConflictError][409] Only one SSE connection is allowed per client; the previous connection must be closed first\n\n`
      );
      return res.end();
    }
    this.streams.add(res);
    this.streamCid.set(res, cid);
    res.on("close", () => {
      this.streams.delete(res);
      this.streamCid.delete(res);
    });
  }

  private subscribed(res: ServerResponse, model: string): boolean {
    if (!this.enforceSubscriptions) return true;
    const cid = this.streamCid.get(res);
    const topics = (cid && this.subscriptions.get(cid)) || [];
    return topics.some((t) => t === "*" || t === model || t.startsWith(`${model}.`));
  }

  /** broadcasts a for-nest shaped event: [model, operation, id, payload] */
  emit(model: string, operation: string, id: string, payload: object = {}) {
    const data = JSON.stringify([model, operation, id, JSON.stringify(payload)]);
    for (const res of this.streams)
      if (this.subscribed(res, model))
        res.write(`event: message\nid: ${++this.seq}\ndata: ${data}\n\n`);
  }

  heartbeat() {
    for (const res of this.streams)
      res.write(
        `event: heartbeat\nid: ${++this.seq}\ndata: {"ts":"${new Date().toISOString()}"}\n\n`
      );
  }

  /** ends every open stream cleanly (e.g. a backend restart) */
  endStreams() {
    for (const res of [...this.streams]) res.end();
  }

  async close(): Promise<void> {
    for (const res of [...this.streams]) res.destroy();
    this.server?.closeAllConnections?.();
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }
}

export const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5000,
  stepMs = 20
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await delay(stepMs);
  }
  return predicate();
}
