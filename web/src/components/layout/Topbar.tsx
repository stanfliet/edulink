"use client";

import { ShieldCheck, Clock } from "lucide-react";
import { useState, useEffect } from "react";

export function Topbar({ title, roleLabel }: { title: string; roleLabel: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-edge bg-void/80 px-4 py-3 backdrop-blur lg:px-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-sm uppercase tracking-[0.25em] text-ink">{title}</h1>
          <p className="text-[11px] uppercase tracking-widest text-ghost">{roleLabel}</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="badge-ok hidden sm:inline-flex">
            <ShieldCheck className="h-3 w-3" /> POPIA Compliant
          </span>
          <span className="mono-num hidden text-xs text-cyan sm:block">
            {now ? now.toLocaleTimeString("en-ZA", { hour12: false }) : "--:--:--"}
          </span>
          <Clock className="h-4 w-4 text-ghost lg:hidden" />
        </div>
      </div>
    </header>
  );
}
