// ============================================================
// EDULINK · 72-hour-disciplinary-tracker
// Scheduled via Render cron -> nightly.
//
// Evaluates attendance records nightly. If a minor child has been
// ABSENT for 3 consecutive days:
//   1. checks parent_consent_popia == TRUE
//   2. if valid, upserts an ACTIVE tracking row into dsd_clinic_cases
//      (chronic indicators appended from learners.chronic_tag)
//   3. dispatches push alerts to clinic + DSD caseworker terminals
//      via OneSignal
// ============================================================
import { getAdminClient, assertCronCall } from "../_shared/supabase-admin.ts";
import { existingCaseId } from "../_shared/idempotency.ts";
import { corsHandler, corsHeaders, json } from "../_shared/cors.ts";

interface AbsenceWindow {
  learner_id: string;
  school_id: string;
  absent_days: number;
}

Deno.serve(async (req: Request) => {
  const pre = corsHandler(req);
  if (pre) return pre;

  try {
    assertCronCall(req);
    const sb = getAdminClient();

    const todayISO = new Date().toISOString().slice(0, 10);
    const d1 = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const d2 = new Date(Date.now() - 172800000).toISOString().slice(0, 10);

    // Learners with 3 consecutive ABSENT records (today, yesterday, day-before)
    const { data: windows, error: errW } = await sb
      .from("attendance_log")
      .select("learner_id, date, status")
      .in("date", [todayISO, d1, d2])
      .eq("status", "ABSENT");

    if (errW) throw errW;

    const learnerAbsences = new Map<string, AbsenceWindow>();
    for (const row of windows ?? []) {
      const cur = learnerAbsences.get(row.learner_id) ?? {
        learner_id: row.learner_id,
        school_id: "",
        absent_days: 0,
      };
      cur.absent_days += 1;
      learnerAbsences.set(row.learner_id, cur);
    }

    const triggers: AbsenceWindow[] = [...learnerAbsences.values()]
      .filter((w) => w.absent_days >= 3);

    let casesCreated = 0;
    let consentDenied = 0;
    let pushesSent = 0;
    const deniedLearners: string[] = [];

    for (const t of triggers) {
      // Resolve school + consent + chronic badge for the learner
      const { data: learner, error: errL } = await sb
        .from("learners")
        .select("learner_id, school_id, first_name, last_name, chronic_tag, parent_consent_popia, cemis_id")
        .eq("learner_id", t.learner_id)
        .single();
      if (errL || !learner) continue;

      if (learner.parent_consent_popia !== true) {
        consentDenied += 1;
        deniedLearners.push(learner.learner_id);
        continue; // consent guard: never open a case without POPIA consent
      }

      const existing = await existingCaseId(sb, learner.learner_id);
      if (existing) continue; // idempotent — no duplicate active cases

      const schoolId = learner.school_id ?? t.school_id;
      const chronicBadge = learner.chronic_tag ?? null;

      const { data: caseRow, error: errC } = await sb
        .from("dsd_clinic_cases")
        .insert({
          school_id: schoolId,
          learner_id: learner.learner_id,
          trigger_date: todayISO,
          chronic_badge: chronicBadge,
          caregiver_stability_index: "PENDING",
          primary_risk_assessment: "UNASSIGNED",
          form_22_filed: false,
          case_notes:
            `Auto-tracked: ${learner.first_name} ${learner.last_name} absent ${t.absent_days} consecutive days.` +
            (chronicBadge ? ` Chronic indicator: ${chronicBadge}.` : ""),
          case_status: "INBOUND_INTAKE",
        })
        .select()
        .single();

      if (errC) {
        // duplicate race -> treat as already handled
        if (String(errC.message).includes("duplicate")) continue;
        throw errC;
      }

      casesCreated += 1;

      // ---- OneSignal push to clinic + DSD terminals ----
      const onesignalApp = Deno.env.get("ONESIGNAL_APP_ID");
      const onesignalKey = Deno.env.get("ONESIGNAL_REST_API_KEY");

      if (onesignalApp && onesignalKey) {
        const headings =
          `${learner.first_name} ${learner.last_name} — 72h absence alert`;
        const contents =
          `${t.absent_days}-day absence streak. Chronic badge: ${chronicBadge ?? "none"}. ` +
          `POPIA consent valid — case ${caseRow.case_id} opened for intake.`;

        const res = await fetch(
          "https://api.onesignal.com/notifications?c=push",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Key ${onesignalKey}`,
            },
            body: JSON.stringify({
              app_id: onesignalApp,
              headings: { en: headings },
              contents: { en: contents },
              included_segments: ["EDULINK_CLINIC", "EDULINK_DSD"],
              priority: 10,
            }),
          },
        );
        if (res.ok) {
          pushesSent += 1;
          await sb
            .from("dsd_clinic_cases")
            .update({ push_notified_at: new Date().toISOString() })
            .eq("case_id", caseRow.case_id);
        } else {
          console.error("OneSignal push failed", res.status, await res.text());
        }
      }
    }

    return json({
      ok: true,
      run_date: todayISO,
      learners_with_3day_absence: triggers.map((t) => t.learner_id),
      consent_denied: deniedLearners,
      cases_created: casesCreated,
      push_alerts_sent: pushesSent,
    }, 200);
  } catch (err) {
    return json(
      { ok: false, error: err instanceof Error ? err.message : "tracker failure" },
      err instanceof Error && err.message.startsWith("FORBIDDEN") ? 403 : 500,
    );
  }
});
