import type { FastifyInstance } from "fastify";
import { comparisonController } from "@/modules/comparison/comparison.controller";

export async function registerComparisonRoutes(app: FastifyInstance) {
  app.get("/api/comparison", comparisonController.getPlaceholder);
}
