"use client";

import { useEffect, useState } from "react";
import { ClipboardPlus, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface VisibleLearner {
  learner_id: string;
  first_name: string;
  last_name: string;
  grade: number;
  class_section: string;
  chronic_tag: string | null;
}

const CSI_OPTIONS = ["PENDING", "LOW", "MODERATE", "HIGH", "STABLE"] as const;
const STATUS_OPTIONS = ["INBOUND_INTAKE", "SCREENED", "INTERVENTION", "FOLLOW_UP", "RESOLVED"] as const;

/**
 * DSD/Clinic intake manager. Learner picker is consent-gated by RLS —
 * only consented, case-managed learners in the worker's zone resolve.
 * A referral learner UUID may also be pasted from approved paperwork.
 */
export function IntakeManager({
  workerId,
  districtZone,
  onCreated,
}: {
  workerId: string;
  districtZone: string;
  onCreated: () => void;
}) {
  const [learners, setLearners] = useState<VisibleLearner[]>([]);
  const [learnerId, setLearnerId] = useState("");
  const [manualId, setManualId] = useState("");
  const [chronic, setChronic] = useState("");
  const [csi, setCsi] = useState<(typeof CSI_OPTIONS)[number]>("PENDING");
  const [risk, setRisk] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("INBOUND_INTAKE");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("learners")
        .select("learner_id, first_name, last_name, grade, class_section, chronic_tag");
      setLearners((data as VisibleLearner[]) ?? []);
      setLoaded(true);
    })();
  }, []);

  async function intake() {
    const target = learnerId || manualId.trim();
    if (!target) {
      setMsg("Select a consented learner or paste a referral learner ID.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.from("dsd_clinic_cases").insert({
      learner_id: target,
      chronic_badge: chronic.trim() || null,
      caregiver_stability_index: csi,
      primary_risk_assessment: risk.trim() || "UNASSIGNED",
      case_notes: notes.trim() || null,
      case_status: status,
      assigned_worker_id: workerId,
      district_zone: districtZone,
      trigger_date: new Date().toISOString().slice(0, 10),
    });
    if (error) {
      setMsg(`Intake rejected: ${error.message}`);
    } else {
      setMsg("Case opened — DSD workflow started.");
      setChronic("");
      setRisk("");
      setNotes("");
      setManualId("");
      onCreated();
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardPlus className="h-4 w-4 text-cyan" />
        <p className="font-display text-[10px] uppercase tracking-[0.25em] text-cyan">New Case Intake</p>
      </div>

      <div>
        <label className="label mb-1 block">Consented Learner (RLS-visible)</label>
        {!loaded ? (
          <div className="grid h-10 place-items-center text-cyan">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : (
          <select value={learnerId} onChange={(e) => setLearnerId(e.target.value)} className="neon-select w-full">
            <option value="">Select learner…</option>
            {learners.map((l) => (
              <option key={l.learner_id} value={l.learner_id}>
                {l.first_name} {l.last_name} · Gr {l.grade}
                {l.class_section} {l.chronic_tag ? `· ${l.chronic_tag}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <label className="label mb-1 block">Or paste referral learner ID (approved paperwork)</label>
        <input
          value={manualId}
          onChange={(e) => setManualId(e.target.value)}
          placeholder="uuid from referral (must match an existing learner)"
          className="neon-input mono-num text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label mb-1 block">Chronic Badge</label>
          <input
            value={chronic}
            onChange={(e) => setChronic(e.target.value)}
            placeholder="e.g. ASTHMA, TB, NONE"
            className="neon-input text-xs"
            maxLength={100}
          />
        </div>
        <div>
          <label className="label mb-1 block">Caregiver Stability Index</label>
          <select value={csi} onChange={(e) => setCsi(e.target.value as never)} className="neon-select w-full">
            {CSI_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label mb-1 block">Primary Risk Assessment</label>
          <input
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
            placeholder="e.g. NUTRITION, WELFARE, ABUSE"
            className="neon-input text-xs"
            maxLength={255}
          />
        </div>
        <div>
          <label className="label mb-1 block">Case Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as never)} className="neon-select w-full">
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label mb-1 block">Case Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Initial assessment notes (POPIA-scoped to this case)…"
          className="neon-input min-h-20 resize-y text-xs"
        />
      </div>

      <button onClick={intake} disabled={busy} className="btn-solid w-full text-xs">
        <ClipboardPlus className="h-3.5 w-3.5" /> {busy ? "Opening case…" : "Open Case"}
      </button>
      {msg && <p className="text-[10px] text-cyan">{msg}</p>}
    </div>
  );
}
