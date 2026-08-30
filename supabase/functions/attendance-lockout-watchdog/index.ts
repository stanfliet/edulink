// ============================================================
// EDULINK · attendance-lockout-watchdog
// Scheduled via Render cron -> daily 14:00.
//
// Scans attendance_log for today. For every class with an active
// roster whose roll has NOT been submitted, writes a LOCKED row to
// attendance_lockouts. The teacher front-end polls that table and
// renders a persistent full-screen modal blocking grading/assignment
// menus until every learner on the register has a status for today.
// ============================================================
import { getAdminClient, assertCronCall } from "../_shared/supabase-admin.ts";
import { corsHandler, corsHeaders, json } from "../_shared/cors.ts";

const ROSTER_BATCH = 400;

Deno.serve(async (req: Request) => {
  const pre = corsHandler(req);
  if (pre) return pre;

  try {
    assertCronCall(req);

    const sb = getAdminClient();
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // 1) every active class that currently has an open lockout for today
    //    (re-locking on re-runs; submission auto-releases via trigger)
    const { data: existing } = await sb
      .from("attendance_lockouts")
      .select("class_id")
      .eq("lockout_date", today)
      .eq("status", "LOCKED");

    const alreadyLocked = new Set((existing ?? []).map((r: { class_id: string }) => r.class_id));

    // 2) all classes across the network
    const { data: classes, error: errClasses } = await sb
      .from("classrooms")
      .select("class_id, school_id, subject_name, grade")
      .order("school_id");

    if (errClasses) throw errClasses;
    if (!classes || classes.length === 0) {
      return json({ ok: true, scanned: 0, locked: 0, message: "no classes configured" });
    }

    // 3) all attendance rows recorded today for roster coverage checks
    const { data: todaysAtt } = await sb
      .from("attendance_log")
      .select("class_id, learner_id")
      .eq("date", today);

    const marked = new Set<string>();
    for (const a of todaysAtt ?? []) marked.add(`${a.class_id}:${a.learner_id}`);

    // 4) all roster links (chunked for safety)
    let links: { class_id: string; learner_id: string }[] = [];
    let from = 0;
    for (;;) {
      const { data: chunk, error: errL } = await sb
        .from("roster_links")
        .select("class_id, learner_id")
        .range(from, from + ROSTER_BATCH - 1);
      if (errL) throw errL;
      if (!chunk || chunk.length === 0) break;
      links = links.concat(chunk);
      from += chunk.length;
      if (chunk.length < ROSTER_BATCH) break;
    }

    const rosterByClass = new Map<string, string[]>();
    for (const l of links) {
      if (!rosterByClass.has(l.class_id)) rosterByClass.set(l.class_id, []);
      rosterByClass.get(l.class_id)!.push(l.learner_id);
    }

    // 5) classes whose roll is incomplete -> lock them
    const toLock = classes.filter((c: { class_id: string }) => {
      if (alreadyLocked.has(c.class_id)) return false;
      const roster = rosterByClass.get(c.class_id) ?? [];
      if (roster.length === 0) return false; // empty register can't be incomplete
      return roster.some((learnerId) => !marked.has(`${c.class_id}:${learnerId}`));
    });

    let locked = 0;
    if (toLock.length > 0) {
      const { error: errIns } = await sb.from("attendance_lockouts").insert(
        toLock.map((c: { class_id: string; school_id: string }) => ({
          class_id: c.class_id,
          school_id: c.school_id,
          lockout_date: today,
          status: "LOCKED",
        })),
      );
      if (errIns) throw errIns;
      locked = toLock.length;
    }

    return json({
      ok: true,
      run_date: today,
      classes_scanned: classes.length,
      rosters_incomplete: toLock.map((c: { class_id: string; subject_name: string; grade: number }) => ({
        class_id: c.class_id,
        label: `${c.subject_name} · Grade ${c.grade}`,
      })),
      locked,
    }, 200);
  } catch (err) {
    return json(
      { ok: false, error: err instanceof Error ? err.message : "watchdog failure" },
      err instanceof Error && err.message.startsWith("FORBIDDEN") ? 403 : 500,
    );
  }
});
