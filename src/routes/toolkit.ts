import type { FastifyInstance } from "fastify";
import { toolkitController } from "@/modules/toolkit/toolkit.controller";

export async function registerToolkitRoutes(app: FastifyInstance) {
  app.get("/api/toolkit", toolkitController.getPlaceholder);
}
