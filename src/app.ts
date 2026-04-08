import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { registerAuth } from "@/plugins/auth";
import { registerCors } from "@/plugins/cors";
import { registerLogger } from "@/plugins/logger";
import { registerSupabase } from "@/plugins/supabase";
import { registerHealthRoutes } from "@/routes/health";
import { registerQueryRoutes } from "@/routes/query";
import { registerDashboardRoutes } from "@/routes/dashboard";
import { registerComparisonRoutes } from "@/routes/comparison";
import { registerToolkitRoutes } from "@/routes/toolkit";
import { registerAuthRoutes } from "@/routes/auth";
import { registerWorkspaceRoutes } from "@/routes/workspace";
import { registerProfileRoutes } from "@/routes/profile";

export async function buildApp() {
  const app = Fastify({
    logger: true
  });

  await app.register(sensible);
  await registerLogger(app);
  await registerCors(app);
  await registerAuth(app);
  await registerSupabase(app);

  await registerHealthRoutes(app);
  await registerQueryRoutes(app);
  await registerDashboardRoutes(app);
  await registerComparisonRoutes(app);
  await registerToolkitRoutes(app);
  await registerAuthRoutes(app);
  await registerWorkspaceRoutes(app);
  await registerProfileRoutes(app);

  return app;
}
