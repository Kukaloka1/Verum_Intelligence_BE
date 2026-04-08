import { buildApp } from "@/app";
import { env } from "@/config/env";
import { logError, logInfo } from "@/utils/logger";

async function start() {
  try {
    const app = await buildApp();
    await app.listen({
      port: env.PORT,
      host: env.HOST
    });
    logInfo("Backend started", { host: env.HOST, port: env.PORT });
  } catch (error) {
    logError("Failed to start backend", { error });
    process.exit(1);
  }
}

start();
