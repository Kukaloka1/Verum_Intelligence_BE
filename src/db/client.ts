import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/config/env";
import type { Database } from "@/db/database.types";

let dbClient: SupabaseClient<Database> | null = null;

export function getDbClient(): SupabaseClient<Database> {
  if (dbClient) {
    return dbClient;
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing Supabase env vars. Expected SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend environment."
    );
  }

  dbClient = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return dbClient;
}
