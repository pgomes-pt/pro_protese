import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "./supabase-config";

let cached: SupabaseClient | null = null;

/** Service-role client for storage uploads (server only). */
export function getSupabaseServiceClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  if (!cached) {
    cached = createClient(getSupabaseUrl(), key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
