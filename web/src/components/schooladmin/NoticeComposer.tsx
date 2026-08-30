"use client";

import { useState } from "react";
import { Megaphone, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const AUDIENCES = ["ALL", "TEACHERS", "PARENTS", "SCHOOL"] as const;

export function NoticeComposer({
  schoolId,
  userId,
  onSent,
}: {
  schoolId: string;
  userId: string;
  onSent: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<(typeof AUDIENCES)[number]>("ALL");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function blast() {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.from("app_notifications").insert({
      school_id: schoolId,
      audience,
      title: title.trim(),
      body: body.trim(),
      created_by: userId,
    });
    if (error) setMsg(`Failed: ${error.message}`);
    else {
      setMsg("Notice blasted across campus feeds.");
      setTitle("");
      setBody("");
      onSent();
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Notice title (e.g. Early closure Friday)"
        className="neon-input"
        maxLength={255}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Notice body…"
        className="neon-input min-h-24 resize-y"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {AUDIENCES.map((a) => (
            <button
              key={a}
              onClick={() => setAudience(a)}
              className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-wider transition ${
                audience === a
                  ? "border-cyan/60 bg-cyan/15 text-cyan"
                  : "border-edge text-ghost hover:text-ink"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
        <button onClick={blast} disabled={busy || !title.trim() || !body.trim()} className="btn-solid text-xs">
          <Send className="h-3.5 w-3.5" /> {busy ? "Blasting…" : "Blast Notice"}
        </button>
      </div>
      {msg && <p className="flex items-center gap-2 text-xs text-cyan"><Megaphone className="h-3.5 w-3.5" /> {msg}</p>}
    </div>
  );
}
