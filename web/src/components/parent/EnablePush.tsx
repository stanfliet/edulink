"use client";

import { useEffect, useState } from "react";
import { BellRing, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { ensurePushSubscription, type PushStatus } from "@/lib/push";

const STATUS_COPY: Record<Exclude<PushStatus, "idle" | "error">, string> = {
  unsupported: "This browser does not support push notifications.",
  denied: "Notification permission was denied — enable it in your browser settings.",
  subscribed: "Push notifications enabled on this device.",
  "already-subscribed": "Push notifications are already enabled on this device.",
};

/**
 * Browser push opt-in card — registers /sw.js and stores the subscription
 * against the signed-in parent so the dispatch function can reach them.
 */
export function EnablePush({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alreadyOn, setAlreadyOn] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        setAlreadyOn(Boolean(sub));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await ensurePushSubscription(userId);
      setStatus(result);
      if (result === "subscribed" || result === "already-subscribed") setAlreadyOn(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const ok = status === "subscribed" || status === "already-subscribed" || alreadyOn;

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md border border-cyan/50 bg-cyan/10 text-cyan shadow-neonSm">
            <BellRing className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-medium text-ink">Push notifications</p>
            <p className="text-[11px] text-ghost">
              Attendance and grade alerts even when EDULINK is closed.
            </p>
          </div>
        </div>
        {!ok ? (
          <button onClick={enable} disabled={busy} className="btn-solid shrink-0 px-4 py-2 text-xs">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Enabling…" : "Enable"}
          </button>
        ) : (
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-cyan">
            <CheckCircle2 className="h-4 w-4" /> Enabled
          </span>
        )}
      </div>

      {status && status !== "subscribed" && status !== "already-subscribed" && (
        <p className="mt-3 flex items-center gap-2 rounded-md border border-crimson/50 bg-crimson/10 px-3 py-2 text-xs text-crimson">
          <ShieldAlert className="h-4 w-4 shrink-0" /> {STATUS_COPY[status as Exclude<PushStatus, "idle" | "error">]}
        </p>
      )}
      {error && (
        <p className="mt-3 flex items-center gap-2 rounded-md border border-crimson/50 bg-crimson/10 px-3 py-2 text-xs text-crimson">
          <ShieldAlert className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
