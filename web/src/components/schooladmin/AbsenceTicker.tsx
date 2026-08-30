"use client";

import { AlertTriangle } from "lucide-react";

interface AbsenceItem {
  attendance_id: string;
  status: string;
  learner: { first_name: string; last_name: string; grade: number; class_section: string } | null;
  classrooms: { subject_name: string } | null;
}

/**
 * Daily absence ticker — marquee-style scrolling feed of today's ABSENT/LATE
 * learners across the campus. Names are shown (school staff scope); contact
 * data stays masked per POPIA.
 */
export function AbsenceTicker({ items }: { items: AbsenceItem[] }) {
  const absent = items.filter((i) => i.status === "ABSENT").length;
  const late = items.filter((i) => i.status === "LATE").length;

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-edge bg-void/40 px-4 py-3 text-xs text-ghost">
        <span className="badge-ok">Clear</span> No absences or late arrivals recorded today.
      </div>
    );
  }

  const labels = items.map((i) => {
    const name = i.learner
      ? `${i.learner.first_name} ${i.learner.last_name} (Gr ${i.learner.grade}${i.learner.class_section})`
      : "learner";
    const subject = i.classrooms?.subject_name ?? "class";
    return `${name} — ${i.status} · ${subject}`;
  });

  return (
    <div className="overflow-hidden rounded-md border border-crimson/30 bg-void/60">
      <div className="flex items-center gap-2 border-b border-crimson/30 bg-crimson/10 px-3 py-2">
        <AlertTriangle className="h-3.5 w-3.5 text-crimson animate-pulseGlow" />
        <span className="font-display text-[10px] uppercase tracking-[0.25em] text-crimson">
          Daily Absence Ticker
        </span>
        <span className="mono-num ml-auto text-[10px] text-crimson">
          {absent} ABSENT · {late} LATE
        </span>
      </div>
      <div className="relative flex overflow-hidden py-2">
        <div className="flex shrink-0 animate-ticker gap-10 whitespace-nowrap px-4 text-[11px] text-ink">
          {[...labels, ...labels].map((l, idx) => (
            <span key={idx} className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-crimson" />
              {l}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
