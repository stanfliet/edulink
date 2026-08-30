"use client";

import { useState } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export interface ChildInfo {
  learner_id: string;
  first_name: string;
  last_name: string;
  grade: number;
  class_section: string;
  chronic_tag: string | null;
  parent_consent_popia: boolean;
  sa_sams_id: string | null;
  exempt_status: boolean;
}

/**
 * POPIA consent panel — parents may toggle only the consent column
 * (enforced server-side by guard_parent_learner_edit). Consent unlocks
 * DSD/clinic visibility for case-managed children.
 */
export function ConsentPanel({ child }: { child: ChildInfo }) {
  const [consent, setConsent] = useState(child.parent_consent_popia);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const next = !consent;
    const { error } = await supabase
      .from("learners")
      .update({ parent_consent_popia: next })
      .eq("learner_id", child.learner_id);
    if (error) {
      setMsg(`Consent update blocked: ${error.message}`);
    } else {
      setConsent(next);
      setMsg(next ? "Consent granted — recorded on the child's profile." : "Consent withdrawn.");
    }
    setBusy(false);
  }

  return (
    <div className="rounded-md border border-edge bg-void/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {consent ? (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />
          ) : (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          )}
          <div>
            <p className="text-xs font-medium text-ink">POPIA Consent</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-ghost">
              {consent
                ? "Granted — DSD/clinic may view this child's health records for case management."
                : "Not granted — health records stay encrypted and inaccessible to DSD/clinic."}
            </p>
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          className={`relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full border transition ${
            consent ? "border-cyan bg-cyan/25" : "border-edge bg-panel2"
          }`}
          aria-label="Toggle POPIA consent"
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${
              consent ? "left-[22px] bg-cyan" : "left-0.5 bg-ghost/60"
            }`}
          />
        </button>
      </div>
      {msg && <p className="mt-2 text-[10px] text-cyan">{msg}</p>}
    </div>
  );
}
