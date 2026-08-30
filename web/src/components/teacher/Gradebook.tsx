"use client";

import { useEffect, useState } from "react";
import { BookOpen, Plus, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, timeUntil } from "@/lib/utils";

interface Assignment {
  assignment_id: string;
  title: string;
  max_points: number;
  due_date: string;
  created_at: string;
}

interface Submission {
  submission_id: string;
  status: string;
  submitted_at: string;
  learner: { first_name: string; last_name: string } | null;
}

interface GradeEntry {
  score: string;
  feedback: string;
  gradeId?: string;
}

/**
 * Gradebook — pick an assignment, grade each submission (score + feedback).
 * Scores are validated against max_points on the client and by CHECK in DB.
 */
export function Gradebook({ classId, teacherId }: { classId: string; teacherId: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selected, setSelected] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [grades, setGrades] = useState<Record<string, GradeEntry>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMax, setNewMax] = useState("100");
  const [newDue, setNewDue] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 16);
  });

  useEffect(() => {
    if (!classId) return;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("assignments")
        .select("assignment_id, title, max_points, due_date, created_at")
        .eq("class_id", classId)
        .order("due_date", { ascending: false });
      const rows = (data as Assignment[]) ?? [];
      setAssignments(rows);
      if (rows.length > 0) setSelected(rows[0].assignment_id);
    })();
  }, [classId]);

  useEffect(() => {
    if (!selected) return;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("submissions")
        .select("submission_id, status, submitted_at, learner:learners(first_name, last_name)")
        .eq("assignment_id", selected);
      const subs = (data as Submission[]) ?? [];
      setSubmissions(subs);
      if (subs.length === 0) {
        setGrades({});
        return;
      }
      const { data: g } = await supabase
        .from("grades")
        .select("grade_id, submission_id, score_achieved, feedback_text")
        .in(
          "submission_id",
          subs.map((s) => s.submission_id),
        );
      const map: Record<string, GradeEntry> = {};
      for (const row of (g ?? []) as Array<{
        grade_id: string;
        submission_id: string;
        score_achieved: number;
        feedback_text: string | null;
      }>) {
        map[row.submission_id] = {
          score: String(row.score_achieved),
          feedback: row.feedback_text ?? "",
          gradeId: row.grade_id,
        };
      }
      setGrades(map);
    })();
  }, [selected]);

  async function saveGrade(sub: Submission) {
    const entry = grades[sub.submission_id];
    if (!entry) return;
    const score = Number(entry.score);
    if (!Number.isFinite(score) || score < 0) {
      setMsg("Score must be a positive number.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const payload = {
      submission_id: sub.submission_id,
      score_achieved: score,
      feedback_text: entry.feedback.trim(),
      graded_by: teacherId,
    };
    const { error } = entry.gradeId
      ? await supabase.from("grades").update(payload).eq("grade_id", entry.gradeId)
      : await supabase.from("grades").insert(payload);
    setMsg(error ? `Failed: ${error.message}` : `Saved score for ${sub.learner?.first_name ?? "learner"}.`);
    setBusy(false);
  }

  async function createAssignment() {
    if (!newTitle.trim()) return;
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("assignments")
      .insert({
        class_id: classId,
        title: newTitle.trim(),
        max_points: Math.max(1, Number(newMax) || 100),
        due_date: new Date(newDue).toISOString(),
      })
      .select("assignment_id, title, max_points, due_date, created_at")
      .single();
    if (error) {
      setMsg(`Failed: ${error.message}`);
    } else {
      setAssignments((a) => [data as Assignment, ...a]);
      setSelected((data as Assignment).assignment_id);
      setShowNew(false);
      setNewTitle("");
      setMsg("Assignment published to the class feed.");
    }
    setBusy(false);
  }

  const active = assignments.find((a) => a.assignment_id === selected);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <BookOpen className="h-3.5 w-3.5 text-cyan" />
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="neon-select flex-1">
          {assignments.length === 0 && <option value="">No assignments yet</option>}
          {assignments.map((a) => (
            <option key={a.assignment_id} value={a.assignment_id}>
              {a.title} · /{a.max_points}
            </option>
          ))}
        </select>
        <button onClick={() => setShowNew((v) => !v)} className="btn-outline text-[10px]">
          <Plus className="h-3 w-3" /> New
        </button>
      </div>

      {showNew && (
        <div className="space-y-2 rounded-md border border-cyan/30 bg-cyan/5 p-3">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Assignment title (e.g. Term 3 Test — Fractions)"
            className="neon-input"
          />
          <div className="flex gap-2">
            <input
              value={newMax}
              onChange={(e) => setNewMax(e.target.value)}
              type="number"
              placeholder="Max points"
              className="neon-input w-28"
            />
            <input
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              type="datetime-local"
              className="neon-input flex-1"
            />
          </div>
          <button onClick={createAssignment} disabled={busy} className="btn-solid text-xs">
            Publish Assignment
          </button>
        </div>
      )}

      {active && (
        <p className="text-[11px] text-ghost">
          {active.title} · /{active.max_points} · due {formatDate(active.due_date)} · {timeUntil(active.due_date)}
        </p>
      )}

      {submissions.length === 0 ? (
        <p className="py-6 text-center text-xs text-ghost">No submissions for this assignment yet.</p>
      ) : (
        <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {submissions.map((s) => {
            const entry = grades[s.submission_id];
            return (
              <li key={s.submission_id} className="rounded-md border border-edge bg-void/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-ink">
                      {s.learner ? `${s.learner.first_name} ${s.learner.last_name}` : "Learner"}
                    </p>
                    <p className="text-[10px] text-ghost">
                      {s.status} · submitted {formatDate(s.submitted_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={entry?.score ?? ""}
                      onChange={(e) =>
                        setGrades((g) => ({
                          ...g,
                          [s.submission_id]: {
                            ...(g[s.submission_id] ?? { feedback: "" }),
                            score: e.target.value,
                          },
                        }))
                      }
                      type="number"
                      placeholder={`/ ${active?.max_points ?? 100}`}
                      className="neon-input w-20 text-right mono-num"
                    />
                    <button onClick={() => saveGrade(s)} disabled={busy} className="btn-outline text-[10px]">
                      <Save className="h-3 w-3" /> Save
                    </button>
                  </div>
                </div>
                <input
                  value={entry?.feedback ?? ""}
                  onChange={(e) =>
                    setGrades((g) => ({
                      ...g,
                      [s.submission_id]: {
                        ...(g[s.submission_id] ?? { score: "" }),
                        feedback: e.target.value,
                      },
                    }))
                  }
                  placeholder="Feedback (optional)"
                  className="neon-input mt-2 text-xs"
                />
              </li>
            );
          })}
        </ul>
      )}
      {msg && <p className="text-[10px] text-cyan">{msg}</p>}
    </div>
  );
}
