"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Status = "PRESENT" | "ABSENT" | "LATE";

interface RosterLearner {
  learner_id: string;
  first_name: string;
  last_name: string;
}

/**
 * Daily attendance register — one tap per learner. Rows are upserted on
 * (class, learner, date). Submitting releases any lockout for the class.
 */
export function AttendanceRegister({
  classId,
  subjectLabel,
}: {
  classId: string;
  subjectLabel: string;
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [roster, setRoster] = useState<RosterLearner[]>([]);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [existing, setExisting] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!classId) return;
    const supabase = createClient();
    (async () => {
      const [rosterRes, attRes] = await Promise.all([
        supabase
          .from("roster_links")
          .select("learner_id, learner:learners(first_name, last_name)")
          .eq("class_id", classId),
        supabase
          .from("attendance_log")
          .select("attendance_id, learner_id, status")
          .eq("class_id", classId)
          .eq("date", today),
      ]);
      const learners = ((rosterRes.data ?? []) as unknown as Array<{
        learner_id: string;
        learner: { first_name: string; last_name: string };
      }>).map((r) => ({
        learner_id: r.learner_id,
        first_name: r.learner.first_name,
        last_name: r.learner.last_name,
      }));
      setRoster(learners);
      const ex: Record<string, string> = {};
      const mk: Record<string, Status> = {};
      for (const a of (attRes.data ?? []) as Array<{ attendance_id: string; learner_id: string; status: string }>) {
        ex[a.learner_id] = a.attendance_id;
        mk[a.learner_id] = a.status as Status;
      }
      setExisting(ex);
      setMarks(mk);
      setLoaded(true);
    })();
  }, [classId, today]);

  async function mark(learnerId: string, status: Status) {
    const supabase = createClient();
    const next = { ...marks, [learnerId]: status };
    setMarks(next);
    setMsg(null);
    const row = {
      class_id: classId,
      learner_id: learnerId,
      date: today,
      status,
      timestamp: new Date().toISOString(),
    };
    const id = existing[learnerId];
    if (id) {
      const { error } = await supabase
        .from("attendance_log")
        .update({ status, timestamp: row.timestamp })
        .eq("attendance_id", id);
      if (error) setMsg(`Save error: ${error.message}`);
    } else {
      const { data, error } = await supabase
        .from("attendance_log")
        .insert(row)
        .select("attendance_id")
        .single();
      if (error) setMsg(`Save error: ${error.message}`);
      else if (data) setExisting((e) => ({ ...e, [learnerId]: data.attendance_id }));
    }
  }

  const counts = useMemo(() => {
    const c = { PRESENT: 0, ABSENT: 0, LATE: 0 };
    for (const s of Object.values(marks)) c[s] += 1;
    return c;
  }, [marks]);

  const recorded = Object.keys(marks).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs text-ghost">
          <CalendarDays className="h-3.5 w-3.5 text-cyan" />
          {subjectLabel} · {today}
        </p>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="badge-ok">{counts.PRESENT} present</span>
          <span className="badge-warn">{counts.LATE} late</span>
          <span className="badge-danger">{counts.ABSENT} absent</span>
        </div>
      </div>

      {!loaded ? (
        <p className="py-8 text-center text-xs text-ghost">Loading register…</p>
      ) : roster.length === 0 ? (
        <p className="py-8 text-center text-xs text-ghost">No learners on this class roster yet.</p>
      ) : (
        <ul className="max-h-96 divide-y divide-edge/50 overflow-y-auto rounded-md border border-edge">
          {roster.map((l) => (
            <li key={l.learner_id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-xs text-ink">
                {l.first_name} {l.last_name}
              </span>
              <div className="flex gap-1">
                {(["PRESENT", "LATE", "ABSENT"] as Status[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => mark(l.learner_id, s)}
                    className={`rounded border px-2.5 py-1 text-[10px] uppercase tracking-wider transition ${
                      marks[l.learner_id] === s
                        ? s === "PRESENT"
                          ? "border-emerald-400/70 bg-emerald-400/15 text-emerald-300"
                          : s === "LATE"
                            ? "border-amber-400/70 bg-amber-400/15 text-amber-300"
                            : "border-crimson/70 bg-crimson/15 text-crimson"
                        : "border-edge text-ghost hover:text-ink"
                    }`}
                  >
                    {s === "PRESENT" ? "✓" : s === "LATE" ? "◷" : "✕"}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {recorded > 0 && (
        <p className="flex items-center gap-1.5 text-[10px] text-cyan">
          <Save className="h-3 w-3" />
          {recorded}/{roster.length} learners marked — saved to the live register.
        </p>
      )}
      {msg && <p className="text-[10px] text-crimson">{msg}</p>}
      {busy && <p className="text-[10px] text-ghost">Saving…</p>}
    </div>
  );
}
