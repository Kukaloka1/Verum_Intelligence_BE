import type { FastifyInstance } from "fastify";
import { getDbClient } from "@/db/client";

export async function registerSupabase(app: FastifyInstance) {
  try {
    getDbClient();
    app.log.info("Supabase client initialized.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Supabase init error.";
    app.log.warn({ err: message }, "Supabase client not initialized. Backend will run without DB access.");
  }
}
