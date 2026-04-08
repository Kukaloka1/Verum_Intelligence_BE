import type { FastifyInstance } from "fastify";
import { workspaceController } from "@/modules/workspace/workspace.controller";

export async function registerWorkspaceRoutes(app: FastifyInstance) {
  app.get("/api/workspace", workspaceController.getPlaceholder);
}
