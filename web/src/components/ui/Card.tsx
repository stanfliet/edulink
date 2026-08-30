import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({
  title,
  icon,
  action,
  children,
  glow = false,
  className,
}: {
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  glow?: boolean;
  className?: string;
}) {
  return (
    <section className={cn(glow ? "panel-glow" : "panel", "flex flex-col p-4", className)}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          <h3 className="panel-title flex items-center gap-2">
            {icon}
            {title}
          </h3>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
