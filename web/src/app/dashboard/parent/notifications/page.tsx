"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, CheckCheck, Loader2, MailOpen } from "lucide-react";
import { RoleGate } from "@/components/layout/RoleGate";
import { RouteTransition } from "@/components/layout/RouteTransition";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { useProfile } from "@/hooks/useProfile";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";

interface Notice {
  notification_id: string;
  school_id: string | null;
  learner_id: string | null;
  audience: string;
  title: string;
  body: string;
  created_at: string;
}

/**
 * Parent Notification Centre — linked learners and every notice targeted at
 * them (LEARNER audience) plus campus-wide notices, with read receipts.
 */
export default function ParentNotificationsPage() {
  const { profile } = useProfile();
  const [children, setChildren] = useState<Array<{ learner_id: string; first_name: string; last_name: string; grade: number; class_section: string }>>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const supabase = createClient();

    const { data: parentRow } = await supabase
      .from("parents")
      .select("parent_id")
      .eq("user_id", profile.user_id)
      .maybeSingle();
    if (!parentRow) {
      setLoaded(true);
      return;
    }

    const { data: kids } = await supabase
      .from("learners")
      .select("learner_id, first_name, last_name, grade, class_section")
      .eq("parent_id", parentRow.parent_id);
    const kidsList = kids ?? [];
    setChildren(kidsList);
    const childIds = kidsList.map((k) => k.learner_id);

    // LEARNER-targeted notices + campus notices (RLS scopes the rows).
    const [learnerNotices, campusNotices, reads] = await Promise.all([
      childIds.length > 0
        ? supabase
            .from("app_notifications")
            .select("notification_id, school_id, learner_id, audience, title, body, created_at")
            .in("learner_id", childIds)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] } as unknown as { data: Notice[] | null }),
      profile.school_id
        ? supabase
            .from("app_notifications")
            .select("notification_id, school_id, learner_id, audience, title, body, created_at")
            .eq("school_id", profile.school_id)
            .in("audience", ["ALL", "PARENTS"])
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] } as unknown as { data: Notice[] | null }),
      supabase.from("notification_reads").select("notification_id").eq("parent_user_id", profile.user_id),
    ]);

    const merged = [...((learnerNotices.data as Notice[]) ?? []), ...((campusNotices.data as Notice[]) ?? [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    setNotices(merged);
    setReadIds(new Set((reads.data ?? []).map((r: { notification_id: string }) => r.notification_id)));
    setLoaded(true);
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  const learnerNoticeIds = useMemo(() => notices.filter((n) => n.audience === "LEARNER").map((n) => n.notification_id), [notices]);
  const unread = useMemo(() => learnerNoticeIds.filter((id) => !readIds.has(id)).length, [learnerNoticeIds, readIds]);

  async function markRead(notificationId: string) {
    if (!profile || readIds.has(notificationId)) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("notification_reads")
      .insert({ notification_id: notificationId, parent_user_id: profile.user_id });
    if (!error) setReadIds((prev) => new Set(prev).add(notificationId));
  }

  async function markAllRead() {
    if (!profile) return;
    const pending = learnerNoticeIds.filter((id) => !readIds.has(id));
    if (pending.length === 0) return;
    setMarking(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("notification_reads")
      .insert(pending.map((id) => ({ notification_id: id, parent_user_id: profile.user_id })));
    if (!error)
      setReadIds((prev) => {
        const next = new Set(prev);
        pending.forEach((id) => next.add(id));
        return next;
      });
    setMarking(false);
  }

  const childName = (learnerId: string | null) => {
    if (!learnerId) return null;
    const c = children.find((k) => k.learner_id === learnerId);
    return c ? `${c.first_name} ${c.last_name}` : null;
  };

  return (
    <RoleGate allowed={["PARENT"]} title="Notification Centre">
      {() => (
        <RouteTransition>
          <div className="space-y-4 p-4 lg:p-8">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Linked Learners" value={String(children.length)} accent="cyan" />
              <StatCard label="Learner Alerts" value={String(learnerNoticeIds.length)} accent="cyan" sub="targeted at your children" />
              <StatCard label="Unread" value={String(unread)} accent={unread > 0 ? "crimson" : "cyan"} />
              <StatCard label="Campus Notices" value={String(notices.length - learnerNoticeIds.length)} accent="ghost" />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {children.map((c) => (
                  <span key={c.learner_id} className="badge-ghost">
                    {c.first_name} {c.last_name} · Gr {c.grade}
                    {c.class_section}
                  </span>
                ))}
              </div>
              {unread > 0 && (
                <button onClick={markAllRead} disabled={marking} className="btn-solid text-[10px]">
                  {marking ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
                  Mark all read
                </button>
              )}
            </div>

            <Card title="All Notifications" icon={<BellRing className="h-3.5 w-3.5" />}>
              {!loaded ? (
                <div className="grid h-32 place-items-center text-cyan">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : notices.length === 0 ? (
                <div className="flex items-center gap-2 rounded-md border border-edge bg-void/40 px-4 py-3 text-xs text-ghost">
                  <BellRing className="h-4 w-4 text-cyan" />
                  No notifications yet — attendance and grade alerts for your children will appear here.
                </div>
              ) : (
                <ul className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
                  {notices.map((n) => {
                    const isLearnerAlert = n.audience === "LEARNER";
                    const isUnread = isLearnerAlert && !readIds.has(n.notification_id);
                    const who = childName(n.learner_id);
                    return (
                      <li key={n.notification_id}>
                        <button
                          onClick={() => isLearnerAlert && markRead(n.notification_id)}
                          className={`w-full rounded-md border p-3 text-left transition ${
                            isUnread ? "border-cyan/50 bg-cyan/5" : "border-edge bg-void/40"
                          } hover:border-cyan/40`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-xs ${isUnread ? "font-semibold text-ink" : "font-medium text-ink"}`}>{n.title}</p>
                            {isUnread ? (
                              <span className="badge-warn shrink-0">unread</span>
                            ) : isLearnerAlert ? (
                              <MailOpen className="h-3.5 w-3.5 shrink-0 text-ghost" />
                            ) : (
                              <span className="badge-ghost shrink-0">{n.audience}</span>
                            )}
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-ghost">{n.body}</p>
                          <p className="mt-1.5 text-[10px] text-ghost">
                            {who ? `${who} · ` : ""}
                            {formatDateTime(n.created_at)}
                            {isLearnerAlert && !readIds.has(n.notification_id) ? " · click to mark read" : ""}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </RouteTransition>
      )}
    </RoleGate>
  );
}
