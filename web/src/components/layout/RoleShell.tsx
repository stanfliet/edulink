import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { LegalFooter } from "./Footer";
import { ROLE_LABELS, type Role } from "@/lib/utils";

/**
 * Every dashboard route renders inside this shell: sidebar navigation,
 * topbar, animated content area, and the POPIA legal footer.
 */
export function RoleShell({
  role,
  fullName,
  cellNumber,
  title,
  children,
}: {
  role: Role;
  fullName: string;
  cellNumber?: string | null;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar role={role} fullName={fullName} cellNumber={cellNumber} />
      <div className="cyber-grid flex min-w-0 flex-1 flex-col">
        <Topbar title={title} roleLabel={ROLE_LABELS[role]} />
        {children}
        <LegalFooter />
      </div>
    </div>
  );
}
