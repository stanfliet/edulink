"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Megaphone, Send } from "lucide-react";
import { RoleGate } from "@/components/layout/RoleGate";
import { RouteTransition } from "@/components/layout/RouteTransition";
import { Card } from "@/components/ui/Card";
import { NoticeComposer } from "@/components/schooladmin/NoticeComposer";
import { useProfile } from "@/hooks/useProfile";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";

interface Notice {
  notification_id: string;
  audience: string;
  title: string;
  body: string;
  created_at: string;
}

export default function NoticesConsolePage() {
  const { profile } = useProfile();
  const sid = profile?.school_id ?? null;
  const uid = profile?.user_id ?? "";
  const [recent, setRecent] = useState<Notice[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadRecent = useCallback(async (sid: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("app_notifications")
      .select("notification_id, audience, title, body, created_at")
      .eq("school_id", sid)
      .order("created_at", { ascending: false })
      .limit(10);
    setRecent((data as Notice[]) ?? []);
  }, []);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      if (profile.school_id) await loadRecent(profile.school_id);
      setLoaded(true);
    })();
  }, [profile, loadRecent]);

  return (
    <RoleGate allowed={["SCHOOLADMIN"]} title="Notice Blasts">
      {() => (
        <RouteTransition>
          <div className="space-y-4 p-4 lg:p-8">
            <div>
              <p className="panel-title">Notice Blasts</p>
              <p className="mt-1 text-xs text-ghost">
                Broadcast to campus feeds — teachers, parents, or everyone
              </p>
            </div>

            <Card title="Compose Notice" icon={<Send className="h-3.5 w-3.5" />}>
              {!loaded ? (
                <div className="grid h-48 place-items-center text-cyan">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : !sid ? (
                <p className="text-xs text-ghost">
                  Your profile is not linked to a school tenant yet — contact Platform Operations.
                </p>
              ) : (
                <NoticeComposer schoolId={sid} userId={uid} onSent={() => void loadRecent(sid)} />
              )}
            </Card>

            <Card title="Recent Blasts" icon={<Megaphone className="h-3.5 w-3.5" />}>
              {!loaded ? (
                <div className="grid h-40 place-items-center text-cyan">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : recent.length === 0 ? (
                <p className="text-xs text-ghost">No notices blasted yet.</p>
              ) : (
                <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {recent.map((n) => (
                    <li key={n.notification_id} className="rounded-md border border-edge bg-void/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[11px] font-medium text-ink">{n.title}</p>
                        <span className="badge-warn">{n.audience}</span>
                      </div>
                      <p className="mt-1 text-[10px] leading-relaxed text-ghost">{n.body}</p>
                      <p className="mono-num text-[10px] text-ghost">{formatDateTime(n.created_at)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </RouteTransition>
      )}
    </RoleGate>
  );
}