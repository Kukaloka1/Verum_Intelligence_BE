import type { FastifyInstance } from "fastify";
import { authController } from "@/modules/auth/auth.controller";

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get("/api/auth", authController.getPlaceholder);
}
