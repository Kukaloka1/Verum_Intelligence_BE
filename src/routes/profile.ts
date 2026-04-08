import type { FastifyInstance } from "fastify";
import { profileController } from "@/modules/profile/profile.controller";

export async function registerProfileRoutes(app: FastifyInstance) {
  app.get("/api/profile", profileController.getPlaceholder);
}
