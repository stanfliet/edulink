"use client";

import { useEffect, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Lockout {
  class_id: string;
  label: string;
  subject_name: string;
  grade: number;
  lockout_date: string;
}

/**
 * Lockout gate — surfaces classes locked by the attendance watchdog
 * (≥5% absenteeism). Attendance entry for those classes is blocked until
 * a register submission releases the lock.
 */
export function LockoutGate({ teacherId }: { teacherId: string }) {
  const [lockouts, setLockouts] = useState<Lockout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teacherId) return;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.rpc("get_teacher_active_lockouts", {
        p_teacher_id: teacherId,
      });
      setLockouts((data as Lockout[]) ?? []);
      setLoading(false);
    })();
  }, [teacherId]);

  if (loading) return null;

  if (lockouts.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-edge bg-void/40 px-4 py-3 text-xs text-ghost">
        <ShieldCheck className="h-4 w-4 text-cyan" />
        No attendance lockouts on your classes. Registers are open.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-crimson/40 bg-crimson/10 p-4">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-crimson" />
        <span className="font-display text-[10px] uppercase tracking-[0.25em] text-crimson">
          Attendance Lockout Active
        </span>
      </div>
      <p className="mt-1 text-[11px] text-ghost">
        The 14:00 watchdog locked these classes due to ≥5% absenteeism. Complete
        today&apos;s register to release the lock (auto-release on submission).
      </p>
      <ul className="mt-3 space-y-1.5">
        {lockouts.map((l) => (
          <li
            key={`${l.class_id}-${l.lockout_date}`}
            className="flex items-center justify-between rounded border border-crimson/30 bg-void/50 px-3 py-2 text-xs"
          >
            <span className="text-ink">{l.label}</span>
            <span className="mono-num text-crimson">{l.lockout_date}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
