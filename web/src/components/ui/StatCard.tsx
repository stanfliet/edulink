"use client";

import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";

export function StatCard({
  label,
  value,
  sub,
  accent = "cyan",
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "cyan" | "crimson" | "amber" | "ghost";
  delta?: number;
}) {
  const accentCls = {
    cyan: "text-cyan",
    crimson: "text-crimson",
    amber: "text-amber-300",
    ghost: "text-ghost",
  }[accent];

  return (
    <div className="panel relative overflow-hidden p-4">
      <div className="absolute right-0 top-0 h-1 w-1/3 bg-gradient-to-l from-transparent to-cyan/40" />
      <p className="label">{label}</p>
      <p className={cn("mono-num mt-2 text-2xl font-semibold tracking-tight", accentCls)}>
        {value}
      </p>
      {(delta !== undefined || sub) && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-ghost">
          {delta !== undefined && (
            <span className="flex items-center gap-0.5 text-cyan">
              <TrendingUp className="h-3 w-3" />
              {delta}%
            </span>
          )}
          {sub}
        </p>
      )}
    </div>
  );
}
