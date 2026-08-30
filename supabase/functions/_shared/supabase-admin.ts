// Shared service-role Supabase client + cron-guard for EDULINK Edge Functions.
// Service-role key bypasses RLS — every function re-validates scope internally.
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const EDULINK_CRON_SECRET = Deno.env.get("EDULINK_CRON_SECRET") ?? "";

export function getAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Render cron jobs authenticate with the shared EDULINK_CRON_SECRET header.
 * Live triggers (e.g. manual "run now") must be invoked from a logged-in
 * user session (anon key + JWT) — handled by the caller when needed.
 */
export function assertCronCall(req: Request): void {
  const header = req.headers.get("x-edulink-cron-secret") ?? "";
  const bodySecret = (() => {
    try {
      const b = (req as unknown as { _body?: string })._body;
      return b ? (JSON.parse(b).cron_secret as string) : "";
    } catch {
      return "";
    }
  })();
  const supplied = header || bodySecret;
  if (!EDULINK_CRON_SECRET || supplied !== EDULINK_CRON_SECRET) {
    throw new Error("FORBIDDEN: invalid cron secret");
  }
}
