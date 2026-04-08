import type { FastifyInstance } from "fastify";
import { dashboardController } from "@/modules/dashboard/dashboard.controller";

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get("/api/dashboard", dashboardController.getPlaceholder);
}
