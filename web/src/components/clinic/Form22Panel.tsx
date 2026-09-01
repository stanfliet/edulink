"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

interface CaseRow {
  case_id: string;
  learner_id: string;
  trigger_date: string;
  form_22_filed: boolean;
  case_status: string;
  primary_risk_assessment: string;
  learner: { first_name: string; last_name: string; grade: number; class_section: string } | null;
}

/**
 * Form 22 (Children's Act 38 of 2005) statutory filing board.
 * Flags cases past the 72-hour statutory window without a filed Form 22.
 */
export function Form22Panel() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("dsd_clinic_cases")
        .select("case_id, learner_id, trigger_date, form_22_filed, case_status, primary_risk_assessment, learner:learners(first_name, last_name, grade, class_section)")
        .order("trigger_date", { ascending: true })
        .limit(60);
      setCases((data as unknown as CaseRow[]) ?? []);
    })();
  }, []);

  const { overdue, filed, inWindow } = useMemo(() => {
    const now = Date.now();
    const split = { overdue: [] as CaseRow[], filed: [] as CaseRow[], inWindow: [] as CaseRow[] };
    for (const c of cases) {
      const hours = (now - new Date(c.trigger_date).getTime()) / 3_600_000;
      if (c.form_22_filed) split.filed.push(c);
      else if (hours > 72) split.overdue.push(c);
      else split.inWindow.push(c);
    }
    return split;
  }, [cases]);

  async function fileNow(c: CaseRow) {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("dsd_clinic_cases")
      .update({ form_22_filed: true })
      .eq("case_id", c.case_id);
    setMsg(error ? `Filing failed: ${error.message}` : `Form 22 filed for case ${c.case_id.slice(0, 8)}.`);
    setBusy(false);
    const { data } = await supabase
      .from("dsd_clinic_cases")
      .select("case_id, learner_id, trigger_date, form_22_filed, case_status, primary_risk_assessment, learner:learners(first_name, last_name, grade, class_section)")
      .order("trigger_date", { ascending: true })
      .limit(60);
    setCases((data as unknown as CaseRow[]) ?? []);
  }

  function Row({ c, tag, action }: { c: CaseRow; tag: "danger" | "warn" | "ok"; action?: boolean }) {
    const hours = Math.floor((Date.now() - new Date(c.trigger_date).getTime()) / 3_600_000);
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 border-b border-edge/50 py-2 last:border-0">
        <div className="min-w-0">
          <p className="truncate text-xs text-ink">
            {c.learner
              ? `${c.learner.first_name} ${c.learner.last_name} · Gr ${c.learner.grade}${c.learner.class_section}`
              : "Consent withheld — identity hidden"}
          </p>
          <p className="text-[10px] text-ghost">
            {c.primary_risk_assessment} · triggered {formatDate(c.trigger_date)} · {hours}h elapsed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={tag === "danger" ? "badge-danger" : tag === "warn" ? "badge-warn" : "badge-ok"}>
            {tag === "danger" ? ">72H UNFILED" : tag === "warn" ? "IN WINDOW" : "FILED"}
          </span>
          {action && (
            <button onClick={() => fileNow(c)} disabled={busy} className="btn-outline text-[10px]">
              File Now
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-crimson" />
        <p className="font-display text-[10px] uppercase tracking-[0.25em] text-cyan">
          Form 22 Statutory Board
        </p>
      </div>

      <div>
        <p className="label mb-1">Breach — past 72h without filing ({overdue.length})</p>
        {overdue.length === 0 ? (
          <p className="text-[10px] text-ghost">No statutory breaches.</p>
        ) : (
          <ul>
            {overdue.map((c) => (
              <Row key={c.case_id} c={c} tag="danger" action />
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="label mb-1">In window ({inWindow.length})</p>
        {inWindow.length === 0 ? (
          <p className="text-[10px] text-ghost">Nothing pending inside the 72-hour window.</p>
        ) : (
          <ul>
            {inWindow.map((c) => (
              <Row key={c.case_id} c={c} tag="warn" action />
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="label mb-1">Filed ({filed.length})</p>
        {filed.length === 0 ? (
          <p className="text-[10px] text-ghost">No Form 22 filings on record.</p>
        ) : (
          <ul>
            {filed.map((c) => (
              <Row key={c.case_id} c={c} tag="ok" />
            ))}
          </ul>
        )}
      </div>
      {msg && <p className="text-[10px] text-cyan">{msg}</p>}
      {busy && <p className="text-[10px] text-ghost">Updating…</p>}
    </div>
  );
}
