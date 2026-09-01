"use client";

import { useEffect, useState } from "react";
import { FileText, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

interface CaseRow {
  case_id: string;
  learner_id: string;
  trigger_date: string;
  chronic_badge: string | null;
  caregiver_stability_index: string;
  primary_risk_assessment: string;
  form_22_filed: boolean;
  case_notes: string | null;
  case_status: string;
  assigned_worker: { full_name: string } | null;
  resolved_at: string | null;
  learner:
    | { first_name: string; last_name: string; grade: number; class_section: string; chronic_tag: string | null }
    | null;
}

const CSI_OPTIONS = ["PENDING", "LOW", "MODERATE", "HIGH", "STABLE"] as const;
const STATUS_OPTIONS = ["INBOUND_INTAKE", "SCREENED", "INTERVENTION", "FOLLOW_UP", "RESOLVED"] as const;

/**
 * Case notebook — zone-scoped case list with editable CSI, status, notes,
 * and the Form 22 statutory filing flag. Learner identities render only
 * while POPIA consent is active (RLS via case_visible_to_agency).
 */
export function CaseNotebook({ workerId }: { workerId: string }) {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [csis, setCsis] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("dsd_clinic_cases")
      .select(
        "case_id, learner_id, trigger_date, chronic_badge, caregiver_stability_index, primary_risk_assessment, form_22_filed, case_notes, case_status, resolved_at, assigned_worker:users(full_name), learner:learners(first_name, last_name, grade, class_section, chronic_tag)",
      )
      .order("trigger_date", { ascending: false })
      .limit(25);
    const rows = (data as unknown as CaseRow[]) ?? [];
    setCases(rows);
    setNotes(Object.fromEntries(rows.map((c) => [c.case_id, c.case_notes ?? ""])));
    setStatuses(Object.fromEntries(rows.map((c) => [c.case_id, c.case_status])));
    setCsis(Object.fromEntries(rows.map((c) => [c.case_id, c.caregiver_stability_index])));
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleForm22(c: CaseRow) {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("dsd_clinic_cases")
      .update({ form_22_filed: !c.form_22_filed })
      .eq("case_id", c.case_id);
    setMsg(error ? `Failed: ${error.message}` : null);
    setBusy(false);
    await load();
  }

  async function save(c: CaseRow) {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const isResolved = statuses[c.case_id] === "RESOLVED";
    const { error } = await supabase
      .from("dsd_clinic_cases")
      .update({
        case_notes: notes[c.case_id] ?? "",
        case_status: statuses[c.case_id] ?? c.case_status,
        caregiver_stability_index: csis[c.case_id] ?? c.caregiver_stability_index,
        resolved_at: isResolved && !c.resolved_at ? new Date().toISOString() : c.resolved_at,
      })
      .eq("case_id", c.case_id);
    setMsg(error ? `Save failed: ${error.message}` : `Case ${c.case_id.slice(0, 8)} saved.`);
    setBusy(false);
    await load();
  }

  const openCount = cases.filter((c) => c.case_status !== "RESOLVED").length;
  const form22Count = cases.filter((c) => c.form_22_filed).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-cyan" />
          <p className="font-display text-[10px] uppercase tracking-[0.25em] text-cyan">
            Zone Case Notebook
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="badge-warn">{openCount} open</span>
          <span className="badge-ghost">{form22Count} Form 22 filed</span>
        </div>
      </div>

      {cases.length === 0 ? (
        <p className="py-8 text-center text-xs text-ghost">
          No cases in your zone. Consented case-managed learners will appear here.
        </p>
      ) : (
        <ul className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
          {cases.map((c) => (
            <li key={c.case_id} className="rounded-md border border-edge bg-void/40">
              <button
                onClick={() => setOpenId(openId === c.case_id ? null : c.case_id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-ink">
                    {c.learner
                      ? `${c.learner.first_name} ${c.learner.last_name} · Gr ${c.learner.grade}${c.learner.class_section}`
                      : "Learner (consent withheld — record hidden)"}
                  </p>
                  <p className="truncate text-[10px] text-ghost">
                    {c.chronic_badge ?? c.learner?.chronic_tag ?? "No chronic tag"} · {c.primary_risk_assessment} ·{" "}
                    {formatDate(c.trigger_date)}
                  </p>
                </div>
                <span
                  className={`shrink-0 ${
                    c.case_status === "RESOLVED"
                      ? "badge-ok"
                      : c.case_status === "INBOUND_INTAKE"
                        ? "badge-danger"
                        : "badge-warn"
                  }`}
                >
                  {c.case_status.replaceAll("_", " ")}
                </span>
              </button>

              {openId === c.case_id && (
                <div className="space-y-2 border-t border-edge/60 px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="label">CSI</span>
                    <select
                      value={csis[c.case_id]}
                      onChange={(e) => setCsis((s) => ({ ...s, [c.case_id]: e.target.value }))}
                      className="neon-select"
                    >
                      {CSI_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                    <span className="label ml-2">Status</span>
                    <select
                      value={statuses[c.case_id]}
                      onChange={(e) => setStatuses((s) => ({ ...s, [c.case_id]: e.target.value }))}
                      className="neon-select"
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                    <label className="ml-auto flex cursor-pointer items-center gap-2 text-[10px] uppercase tracking-wider text-ghost">
                      <input
                        type="checkbox"
                        checked={c.form_22_filed}
                        onChange={() => toggleForm22(c)}
                        disabled={busy}
                        className="accent-[#ff0055]"
                      />
                      Form 22 filed
                    </label>
                  </div>
                  <textarea
                    value={notes[c.case_id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [c.case_id]: e.target.value }))}
                    placeholder="Case notes…"
                    className="neon-input min-h-20 resize-y text-xs"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] text-ghost">
                      Worker: {c.assigned_worker?.full_name ?? "—"}
                      {c.resolved_at && ` · resolved ${formatDate(c.resolved_at)}`}
                    </p>
                    <button onClick={() => save(c)} disabled={busy} className="btn-outline text-[10px]">
                      <Save className="h-3 w-3" /> Save Case
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="text-[10px] text-cyan">{msg}</p>}
      {workerId && <span className="hidden">{workerId}</span>}
    </div>
  );
}
