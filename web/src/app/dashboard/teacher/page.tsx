"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Loader2, UserCheck } from "lucide-react";
import { RoleGate } from "@/components/layout/RoleGate";
import { RouteTransition } from "@/components/layout/RouteTransition";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { LockoutGate } from "@/components/teacher/LockoutGate";
import { AttendanceRegister } from "@/components/teacher/AttendanceRegister";
import { Gradebook } from "@/components/teacher/Gradebook";
import { useProfile } from "@/hooks/useProfile";
import { createClient } from "@/lib/supabase/client";

interface MyClass {
  class_id: string;
  subject_name: string;
  grade: number;
  roster_count: number;
}

export default function TeacherDashboard() {
  const { profile } = useProfile();
  const [classes, setClasses] = useState<MyClass[]>([]);
  const [active, setActive] = useState<string>("");
  const [absentToday, setAbsentToday] = useState(0);
  const [lockoutCount, setLockoutCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();
    (async () => {
      const { data: rows } = await supabase
        .from("classrooms")
        .select("class_id, subject_name, grade")
        .eq("teacher_id", profile.user_id);
      const classList = ((rows ?? []) as Array<{ class_id: string; subject_name: string; grade: number }>).map(
        (c) => ({ ...c, roster_count: 0 }),
      );
      setClasses(classList);
      if (classList.length > 0) setActive(classList[0].class_id);

      const [att, lock] = await Promise.all([
        supabase
          .from("attendance_log")
          .select("attendance_id", { count: "exact", head: true })
          .eq("date", new Date().toISOString().slice(0, 10))
          .in("status", ["ABSENT", "LATE"])
          .in("class_id", classList.map((c) => c.class_id)),
        supabase.rpc("get_teacher_active_lockouts", { p_teacher_id: profile.user_id }),
      ]);
      setAbsentToday(att.count ?? 0);
      setLockoutCount((lock.data as unknown[] | null)?.length ?? 0);
      setLoaded(true);
    })();
  }, [profile]);

  const activeClass = useMemo(() => classes.find((c) => c.class_id === active), [classes, active]);
  const rosterTotal = useMemo(() => classes.reduce((s, c) => s + c.roster_count, 0), [classes]);

  return (
    <RoleGate allowed={["TEACHER"]} title="Class Console">
      {() => (
        <RouteTransition>
          <div className="space-y-4 p-4 lg:p-8">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="My Classes" value={String(classes.length)} accent="cyan" />
              <StatCard label="Learners on Roster" value={String(rosterTotal)} accent="cyan" />
              <StatCard
                label="Absent / Late Today"
                value={String(absentToday)}
                accent={absentToday > 0 ? "crimson" : "cyan"}
              />
              <StatCard
                label="Active Lockouts"
                value={String(lockoutCount)}
                accent={lockoutCount > 0 ? "amber" : "ghost"}
              />
            </div>

            <LockoutGate teacherId={profile?.user_id ?? ""} />

            {!loaded ? (
              <div className="grid h-48 place-items-center text-cyan">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : classes.length === 0 ? (
              <div className="panel p-8 text-center">
                <ClipboardList className="mx-auto h-10 w-10 text-ghost" />
                <p className="mt-3 text-sm text-ink">No classes assigned to you yet.</p>
                <p className="mt-1 text-xs text-ghost">
                  Ask your SchoolAdmin to link classes to your teacher profile.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {classes.map((c) => (
                    <button
                      key={c.class_id}
                      onClick={() => setActive(c.class_id)}
                      className={`rounded-md border px-3 py-1.5 text-[11px] uppercase tracking-wider transition ${
                        active === c.class_id
                          ? "border-cyan/70 bg-cyan/15 text-cyan"
                          : "border-edge text-ghost hover:text-ink"
                      }`}
                    >
                      {c.subject_name} · Gr {c.grade}
                    </button>
                  ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card
                    title="Attendance Register"
                    icon={<UserCheck className="h-3.5 w-3.5" />}
                    className="lg:col-span-1"
                  >
                    {activeClass && (
                      <AttendanceRegister
                        classId={activeClass.class_id}
                        subjectLabel={`${activeClass.subject_name} · Gr ${activeClass.grade}`}
                      />
                    )}
                  </Card>
                  <Card title="Gradebook" icon={<ClipboardList className="h-3.5 w-3.5" />} className="lg:col-span-1">
                    {activeClass && (
                      <Gradebook classId={activeClass.class_id} teacherId={profile?.user_id ?? ""} />
                    )}
                  </Card>
                </div>
              </>
            )}
          </div>
        </RouteTransition>
      )}
    </RoleGate>
  );
}
