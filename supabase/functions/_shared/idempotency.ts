// Idempotency helpers for the 72-hour tracker and PayFast webhook so
// retries / overlapping cron runs never double-create cases or payments.

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export async function existingCaseId(
  sb: SupabaseClient,
  learnerId: string,
): Promise<string | null> {
  const { data } = await sb
    .from("dsd_clinic_cases")
    .select("case_id")
    .eq("learner_id", learnerId)
    .neq("case_status", "RESOLVED")
    .limit(1);
  return data?.[0]?.case_id ?? null;
}

export async function existingEvent(
  sb: SupabaseClient,
  providerPaymentId: string,
): Promise<boolean> {
  const { data } = await sb
    .from("billing_events")
    .select("event_id")
    .eq("provider_payment_id", providerPaymentId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}
