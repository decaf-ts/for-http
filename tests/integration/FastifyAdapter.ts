import Fastify, { FastifyInstance } from "fastify";
import { Repository } from "@decaf-ts/core";

type OrderBy = [string, "asc" | "dsc"];

function parseOrderBy(orderBy?: string): OrderBy | undefined {
  if (!orderBy) return undefined;

  const match = orderBy.match(/^(\w+)(Asc|Dsc|Desc)$/i);
  if (!match) return undefined;

  const [, field, dir] = match;
  const direction = ["desc", "dsc"].includes(dir.toLowerCase()) ? "dsc" : "asc";

  return [field, direction];
}

function parseValue(value: string): any {
  if (value === "true") return true;
  if (value === "false") return false;
  if (!isNaN(Number(value))) return Number(value);
  return value;
}

export function buildServer(repo: Repository<any, any, any>): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/query/:methodName", async (request, reply) => {
    const { methodName } = request.params as { methodName: string };
    const query = request.query as Record<string, any>;

    if (typeof repo[methodName] !== "function") {
      return reply.status(400).send({ error: "Invalid method" });
    }

    const { orderBy, limit, skip, ...rawArgs } = query;

    const args = [
      ...Object.keys(rawArgs).map((k) => parseValue(rawArgs[k])),
      [parseOrderBy(orderBy)],
      limit ? Number(limit) : undefined,
      skip ? Number(skip) : undefined,
    ];

    try {
      const result = await (repo[methodName] as any)(...args);
      return reply.send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || "Unexpected error" });
    }
  });

  return app;
}
