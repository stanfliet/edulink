"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, ClipboardList, Loader2 } from "lucide-react";
import { RoleGate } from "@/components/layout/RoleGate";
import { RouteTransition } from "@/components/layout/RouteTransition";
import { Card } from "@/components/ui/Card";
import { Gradebook } from "@/components/teacher/Gradebook";
import { useProfile } from "@/hooks/useProfile";
import { createClient } from "@/lib/supabase/client";

interface MyClass {
  class_id: string;
  subject_name: string;
  grade: number;
}

export default function TeacherGradebookPage() {
  const { profile } = useProfile();
  const [classes, setClasses] = useState<MyClass[]>([]);
  const [active, setActive] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();
    (async () => {
      const { data: rows } = await supabase
        .from("classrooms")
        .select("class_id, subject_name, grade")
        .eq("teacher_id", profile.user_id);
      const classList = (rows ?? []) as MyClass[];
      setClasses(classList);
      if (classList.length > 0) setActive(classList[0].class_id);
      setLoaded(true);
    })();
  }, [profile]);

  const activeClass = useMemo(() => classes.find((c) => c.class_id === active), [classes, active]);

  return (
    <RoleGate allowed={["TEACHER"]} title="Gradebook">
      {() => (
        <RouteTransition>
          <div className="space-y-4 p-4 lg:p-8">
            <div>
              <p className="panel-title">Gradebook</p>
              <p className="mt-1 text-xs text-ghost">
                Publish assignments, grade submissions, and send feedback
              </p>
            </div>

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

                <Card title="Assignments & Submissions" icon={<BookOpen className="h-3.5 w-3.5" />}>
                  {activeClass && <Gradebook classId={activeClass.class_id} teacherId={profile?.user_id ?? ""} />}
                </Card>
              </>
            )}
          </div>
        </RouteTransition>
      )}
    </RoleGate>
  );
}