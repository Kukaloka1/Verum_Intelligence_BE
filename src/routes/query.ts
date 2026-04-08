import type { FastifyInstance } from "fastify";
import { queryController } from "@/modules/query/query.controller";

export async function registerQueryRoutes(app: FastifyInstance) {
  app.post("/v1/query", queryController.postQuery);
  app.post("/api/query", queryController.postQuery);
}
