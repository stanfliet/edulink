"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, timeUntil } from "@/lib/utils";

interface CalendarItem {
  assignment_id: string;
  title: string;
  due_date: string;
  subject_name: string;
  learner_first: string;
  learner_last: string;
  max_points: number;
}

/**
 * Family calendar — upcoming assessments across the parent's children,
 * surfaced from the class assignment feeds (RLS-scoped to own children).
 */
export function ParentCalendar({ childIds }: { childIds: string[] }) {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (childIds.length === 0) {
      setLoaded(true);
      return;
    }
    const supabase = createClient();
    (async () => {
      const { data: roster } = await supabase
        .from("roster_links")
        .select("class_id")
        .in("learner_id", childIds);
      const classIds = Array.from(new Set((roster ?? []).map((r) => r.class_id)));
      if (classIds.length === 0) {
        setLoaded(true);
        return;
      }
      const { data: assignments } = await supabase
        .from("assignments")
        .select("assignment_id, title, due_date, max_points, class_id, classrooms(subject_name)")
        .in("class_id", classIds)
        .gte("due_date", new Date().toISOString())
        .order("due_date", { ascending: true })
        .limit(12);

      const { data: links } = await supabase
        .from("roster_links")
        .select("class_id, learner:learners(first_name, last_name)")
        .in("class_id", classIds)
        .in("learner_id", childIds);

      const learnerByClass: Record<string, { first_name: string; last_name: string }[]> = {};
      for (const l of (links ?? []) as Array<{
        class_id: string;
        learner: { first_name: string; last_name: string } | null;
      }>) {
        if (!l.learner) continue;
        (learnerByClass[l.class_id] ??= []).push(l.learner);
      }

      const rows: CalendarItem[] = [];
      for (const a of (assignments ?? []) as Array<{
        assignment_id: string;
        title: string;
        due_date: string;
        max_points: number;
        class_id: string;
        classrooms: { subject_name: string } | null;
      }>) {
        for (const learner of learnerByClass[a.class_id] ?? []) {
          rows.push({
            assignment_id: a.assignment_id,
            title: a.title,
            due_date: a.due_date,
            subject_name: a.classrooms?.subject_name ?? "Class",
            learner_first: learner.first_name,
            learner_last: learner.last_name,
            max_points: a.max_points,
          });
        }
      }
      setItems(rows.slice(0, 12));
      setLoaded(true);
    })();
  }, [childIds]);

  if (!loaded) return <p className="py-8 text-center text-xs text-ghost">Loading calendar…</p>;

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-edge bg-void/40 px-4 py-3 text-xs text-ghost">
        <CalendarDays className="h-4 w-4 text-cyan" />
        No upcoming assessments on file for your children.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={`${i.assignment_id}-${i.learner_first}`} className="rounded-md border border-edge bg-void/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-ink">
              {i.subject_name} — {i.title}
            </p>
            <span className="badge-ghost shrink-0">/{i.max_points}</span>
          </div>
          <p className="mt-1 text-[10px] text-ghost">
            {i.learner_first} {i.learner_last}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[10px] text-cyan">
            <Clock className="h-3 w-3" />
            {formatDate(i.due_date)} · {timeUntil(i.due_date)}
          </p>
        </li>
      ))}
    </ul>
  );
}
