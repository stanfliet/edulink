"use client";

import { useEffect, useMemo, useState } from "react";
import { Timer, RefreshCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

interface TrackerRow {
  case_id: string;
  learner_id: string;
  trigger_date: string;
  case_status: string;
  push_notified_at: string | null;
  form_22_filed: boolean;
  chronic_badge: string | null;
  learner: { first_name: string; last_name: string; grade: number; class_section: string } | null;
}

/**
 * 72-hour statutory clock board for the disciplinary tracker.
 * Mirrors the disciplinary-72h-tracker edge function output:
 * every open case shows hours elapsed since trigger, and rows breach
 * once >72h without resolution or Form 22 filing.
 */
export function Disciplinary72() {
  const [rows, setRows] = useState<TrackerRow[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("dsd_clinic_cases")
      .select(
        "case_id, learner_id, trigger_date, case_status, push_notified_at, form_22_filed, chronic_badge, learner:learners(first_name, last_name, grade, class_section)",
      )
      .neq("case_status", "RESOLVED")
      .order("trigger_date", { ascending: true })
      .limit(50);
    setRows((data as unknown as TrackerRow[]) ?? []);
    setBusy(false);
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const now = Date.now();
    let breach = 0;
    let warned = 0;
    let clear = 0;
    for (const r of rows) {
      const hours = (now - new Date(r.trigger_date).getTime()) / 3_600_000;
      if (hours > 72) breach++;
      else if (hours > 48) warned++;
      else clear++;
    }
    return { breach, warned, clear };
  }, [rows]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-cyan" />
          <p className="font-display text-[10px] uppercase tracking-[0.25em] text-cyan">
            72-Hour Disciplinary Clock
          </p>
        </div>
        <button onClick={load} disabled={busy} className="btn-outline text-[10px]">
          <RefreshCcw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-[10px]">
        <span className="badge-danger">{stats.breach} breached</span>
        <span className="badge-warn">{stats.warned} nearing 72h</span>
        <span className="badge-ok">{stats.clear} in window</span>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-ghost">
          No open cases on the disciplinary clock in your zone.
        </p>
      ) : (
        <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
          {rows.map((r) => {
            const hours = Math.floor((Date.now() - new Date(r.trigger_date).getTime()) / 3_600_000);
            const pct = Math.min(100, Math.round((hours / 72) * 100));
            const breached = hours > 72;
            return (
              <li key={r.case_id} className="rounded-md border border-edge bg-void/40 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-ink">
                    {r.learner
                      ? `${r.learner.first_name} ${r.learner.last_name} · Gr ${r.learner.grade}${r.learner.class_section}`
                      : "Consent withheld — identity hidden"}
                  </p>
                  <span className={breached ? "badge-danger" : hours > 48 ? "badge-warn" : "badge-ok"}>
                    {hours}h / 72h
                  </span>
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-void">
                  <div
                    className={`h-full rounded-full ${breached ? "bg-crimson" : hours > 48 ? "bg-cyan/70" : "bg-cyan"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-ghost">
                  {formatDate(r.trigger_date)} · {r.case_status.replaceAll("_", " ")}
                  {r.form_22_filed ? " · Form 22 filed" : ""}
                  {r.push_notified_at ? ` · pushed ${formatDate(r.push_notified_at)}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {busy && <p className="text-[10px] text-ghost">Refreshing…</p>}
    </div>
  );
}
