"use client";

import { createClient } from "./client";

/**
 * Invoke a Supabase Edge Function with the caller's session JWT.
 * verify_jwt=true functions require the Authorization header.
 */
export async function invokeFunction<T = unknown>(
  name: string,
  payload: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(payload),
      },
    );
    const body = await res.json().catch(() => null);
    if (!res.ok) return { data: null, error: body?.error ?? `HTTP ${res.status}` };
    return { data: body as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}
