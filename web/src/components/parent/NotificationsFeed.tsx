"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";

interface Notice {
  notification_id: string;
  title: string;
  body: string;
  audience: string;
  created_at: string;
}

/**
 * Parent notification feed — campus-wide and parent-targeted notices.
 * Client filters to ALL/PARENTS audiences (staff notices stay hidden).
 */
export function NotificationsFeed({ schoolId }: { schoolId: string | null }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!schoolId) {
      setLoaded(true);
      return;
    }
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("app_notifications")
        .select("notification_id, title, body, audience, created_at")
        .eq("school_id", schoolId)
        .in("audience", ["ALL", "PARENTS"])
        .order("created_at", { ascending: false })
        .limit(10);
      setNotices((data as Notice[]) ?? []);
      setLoaded(true);
    })();
  }, [schoolId]);

  if (!loaded) return <p className="py-8 text-center text-xs text-ghost">Loading notices…</p>;

  if (notices.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-edge bg-void/40 px-4 py-3 text-xs text-ghost">
        <Bell className="h-4 w-4 text-cyan" />
        No campus notices for parents right now.
      </div>
    );
  }

  return (
    <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
      {notices.map((n) => (
        <li key={n.notification_id} className="rounded-md border border-edge bg-void/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-ink">{n.title}</p>
            <span className="badge-ghost shrink-0">{n.audience}</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-ghost">{n.body}</p>
          <p className="mt-1.5 text-[10px] text-ghost">{formatDateTime(n.created_at)}</p>
        </li>
      ))}
    </ul>
  );
}
