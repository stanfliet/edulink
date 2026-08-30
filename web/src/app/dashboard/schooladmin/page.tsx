"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileSpreadsheet, Loader2, Megaphone, Users } from "lucide-react";
import { RoleGate } from "@/components/layout/RoleGate";
import { RouteTransition } from "@/components/layout/RouteTransition";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { IngestZone } from "@/components/schooladmin/IngestZone";
import { AbsenceTicker } from "@/components/schooladmin/AbsenceTicker";
import { NoticeComposer } from "@/components/schooladmin/NoticeComposer";
import { createClient } from "@/lib/supabase/client";

export default function SchoolAdminDashboard() {
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [stats, setStats] = useState<{ learners: number; classes: number; absentToday: number; importCount: number }>({
    learners: 0,
    classes: 0,
    absentToday: 0,
    importCount: 0,
  });
  const [ticker, setTicker] = useState<unknown[]>([]);
  const [notices, setNotices] = useState<unknown[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function loadAll() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data: profile } = await supabase
      .from("users")
      .select("school_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const sid = profile?.school_id as string;
    setSchoolId(sid);
    if (!sid) return;

    const [learners, classes, att, imports, notif] = await Promise.all([
      supabase.from("learners").select("learner_id", { count: "exact", head: true }).eq("school_id", sid),
      supabase.from("classrooms").select("class_id", { count: "exact", head: true }).eq("school_id", sid),
      supabase
        .from("attendance_log")
        .select("attendance_id, status, learner:learners(first_name,last_name,grade,class_section), classrooms(subject_name)")
        .eq("date", new Date().toISOString().slice(0, 10))
        .in("status", ["ABSENT", "LATE"]),
      supabase.from("data_imports").select("import_id", { count: "exact", head: true }).eq("school_id", sid),
      supabase.from("app_notifications").select("notification_id, title, body, audience, created_at").eq("school_id", sid).order("created_at", { ascending: false }).limit(6),
    ]);

    setStats({
      learners: learners.count ?? 0,
      classes: classes.count ?? 0,
      absentToday: (att.data?.length ?? 0),
      importCount: imports.count ?? 0,
    });
    setTicker(att.data ?? []);
    setNotices(notif.data ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    loadAll();
  }, []);

  return (
    <RoleGate allowed={["SCHOOLADMIN"]} title="Campus Overview">
      {() => (
        <RouteTransition>
          <div className="space-y-4 p-4 lg:p-8">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Learners on Roll" value={String(stats.learners)} accent="cyan" />
              <StatCard label="Active Classes" value={String(stats.classes)} accent="cyan" />
              <StatCard
                label="Absent / Late Today"
                value={String(stats.absentToday)}
                accent={stats.absentToday > 0 ? "crimson" : "cyan"}
              />
              <StatCard label="Data Imports" value={String(stats.importCount)} accent="cyan" />
            </div>

            <AbsenceTicker items={ticker as never} />

            <div className="grid gap-4 lg:grid-cols-2">
              <Card
                title="Data Ingestion Zone"
                icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
                action={
                  <Link href="/dashboard/schooladmin/ingest" className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-cyan hover:text-acid">
                    Full console <ArrowRight className="h-3 w-3" />
                  </Link>
                }
              >
                {loaded && schoolId ? (
                  <IngestZone schoolId={schoolId} />
                ) : (
                  <div className="grid h-32 place-items-center text-cyan">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                )}
              </Card>

              <Card
                title="Campus Notice Blast"
                icon={<Megaphone className="h-3.5 w-3.5" />}
                action={
                  <Link href="/dashboard/schooladmin/notices" className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-cyan hover:text-acid">
                    History <ArrowRight className="h-3 w-3" />
                  </Link>
                }
              >
                {loaded && schoolId && userId ? (
                  <NoticeComposer schoolId={schoolId} userId={userId} onSent={loadAll} />
                ) : (
                  <div className="grid h-32 place-items-center text-cyan">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                )}
              </Card>
            </div>

            {/* recent blasts */}
            <Card title="Recent Notices" icon={<Users className="h-3.5 w-3.5" />}>
              {notices.length === 0 ? (
                <p className="text-xs text-ghost">No campus notices yet.</p>
              ) : (
                <ul className="divide-y divide-edge/60">
                  {(notices as Array<{ notification_id: string; title: string; body: string; audience: string; created_at: string }>).map((n) => (
                    <li key={n.notification_id} className="flex items-start justify-between gap-3 py-2.5">
                      <div>
                        <p className="text-xs font-medium text-ink">{n.title}</p>
                        <p className="text-[11px] text-ghost">{n.body}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="badge-ghost">{n.audience}</span>
                        <span className="text-[10px] text-ghost">
                          {new Date(n.created_at).toLocaleDateString("en-ZA")}
                        </span>
                      </div>
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
