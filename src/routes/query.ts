import type { FastifyInstance } from "fastify";
import { queryController } from "@/modules/query/query.controller";

export async function registerQueryRoutes(app: FastifyInstance) {
  app.get("/api/query", queryController.getPlaceholder);
}
