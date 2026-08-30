"use client";

import { useEffect, useState } from "react";
import { BookHeart, CalendarDays, HeartPulse, Loader2, Users } from "lucide-react";
import { RoleGate } from "@/components/layout/RoleGate";
import { RouteTransition } from "@/components/layout/RouteTransition";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { ConsentPanel, type ChildInfo } from "@/components/parent/ConsentPanel";
import { ParentCalendar } from "@/components/parent/ParentCalendar";
import { NotificationsFeed } from "@/components/parent/NotificationsFeed";
import { useProfile } from "@/hooks/useProfile";
import { createClient } from "@/lib/supabase/client";

export default function ParentDashboard() {
  const { profile } = useProfile();
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [absentByChild, setAbsentByChild] = useState<Record<string, number>>({});
  const [absentTotal, setAbsentTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();
    (async () => {
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
        .select(
          "learner_id, first_name, last_name, grade, class_section, chronic_tag, parent_consent_popia, sa_sams_id, exempt_status",
        )
        .eq("parent_id", parentRow.parent_id);
      const childrenList = (kids as ChildInfo[]) ?? [];
      setChildren(childrenList);

      const childIds = childrenList.map((c) => c.learner_id);
      if (childIds.length > 0) {
        const since = new Date();
        since.setDate(since.getDate() - 13);
        const { data: att } = await supabase
          .from("attendance_log")
          .select("learner_id")
          .in("learner_id", childIds)
          .in("status", ["ABSENT", "LATE"])
          .gte("date", since.toISOString().slice(0, 10));
        const map: Record<string, number> = {};
        let total = 0;
        for (const row of (att ?? []) as Array<{ learner_id: string }>) {
          map[row.learner_id] = (map[row.learner_id] ?? 0) + 1;
          total += 1;
        }
        setAbsentByChild(map);
        setAbsentTotal(total);
      }
      setLoaded(true);
    })();
  }, [profile]);

  return (
    <RoleGate allowed={["PARENT"]} title="Family Portal">
      {() => (
        <RouteTransition>
          <div className="space-y-4 p-4 lg:p-8">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Children on File" value={String(children.length)} accent="cyan" />
              <StatCard
                label="Absences · 14 days"
                value={String(absentTotal)}
                accent={absentTotal > 0 ? "amber" : "cyan"}
              />
              <StatCard
                label="Consent Granted"
                value={String(children.filter((c) => c.parent_consent_popia).length)}
                accent="cyan"
                sub="of your children"
              />
              <StatCard
                label="Chronic Health Tags"
                value={String(children.filter((c) => c.chronic_tag).length)}
                accent={children.some((c) => c.chronic_tag) ? "crimson" : "ghost"}
              />
            </div>

            {!loaded ? (
              <div className="grid h-48 place-items-center text-cyan">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : children.length === 0 ? (
              <div className="panel p-8 text-center">
                <Users className="mx-auto h-10 w-10 text-ghost" />
                <p className="mt-3 text-sm text-ink">No children linked to your profile yet.</p>
                <p className="mt-1 text-xs text-ghost">
                  Contact your school to link your child&apos;s learner profile to this parent account.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                <Card title="My Children" icon={<BookHeart className="h-3.5 w-3.5" />} className="lg:col-span-1">
                  <ul className="space-y-3">
                    {children.map((c) => (
                      <li key={c.learner_id} className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-ink">
                              {c.first_name} {c.last_name}
                            </p>
                            <p className="text-[10px] text-ghost">
                              Grade {c.grade}
                              {c.class_section} {c.chronic_tag && <span className="text-crimson">· {c.chronic_tag}</span>}
                            </p>
                          </div>
                          <span
                            className={
                              (absentByChild[c.learner_id] ?? 0) > 0 ? "badge-warn" : "badge-ok"
                            }
                          >
                            {(absentByChild[c.learner_id] ?? 0)} absent 14d
                          </span>
                        </div>
                        <ConsentPanel child={c} />
                      </li>
                    ))}
                  </ul>
                </Card>

                <Card
                  title="Upcoming Assessments"
                  icon={<CalendarDays className="h-3.5 w-3.5" />}
                  className="lg:col-span-1"
                >
                  <ParentCalendar childIds={children.map((c) => c.learner_id)} />
                </Card>

                <Card title="Campus Notices" icon={<HeartPulse className="h-3.5 w-3.5" />} className="lg:col-span-1">
                  <NotificationsFeed schoolId={profile?.school_id ?? null} />
                </Card>
              </div>
            )}
          </div>
        </RouteTransition>
      )}
    </RoleGate>
  );
}
