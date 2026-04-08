import type { FastifyInstance } from "fastify";
import { APP_NAME } from "@/config/constants";
import { nowIso } from "@/utils/dates";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async function healthHandler() {
    return {
      ok: true,
      service: APP_NAME,
      timestamp: nowIso()
    };
  });
}
