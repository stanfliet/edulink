"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  School,
  BookOpen,
  Users,
  HeartPulse,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import { maskCell, type Role } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: Partial<Record<Role, NavItem[]>> = {
  SUPERADMIN: [
    { href: "/dashboard/superadmin", label: "Network Command", icon: LayoutDashboard },
    { href: "/dashboard/superadmin/billing", label: "Master Billing", icon: School },
  ],
  SCHOOLADMIN: [
    { href: "/dashboard/schooladmin", label: "Campus Overview", icon: LayoutDashboard },
    { href: "/dashboard/schooladmin/ingest", label: "Data Ingestion", icon: BookOpen },
    { href: "/dashboard/schooladmin/notices", label: "Notice Blasts", icon: Users },
  ],
  TEACHER: [
    { href: "/dashboard/teacher", label: "My Classes", icon: LayoutDashboard },
    { href: "/dashboard/teacher/gradebook", label: "Gradebook", icon: BookOpen },
  ],
  PARENT: [
    { href: "/dashboard/parent", label: "Family Hub", icon: LayoutDashboard },
    { href: "/dashboard/parent/consent", label: "Health Net Consent", icon: HeartPulse },
  ],
  CLINIC_USER: [
    { href: "/dashboard/clinic", label: "Case Intake", icon: LayoutDashboard },
  ],
  DSD_USER: [
    { href: "/dashboard/clinic", label: "Case Intake", icon: LayoutDashboard },
  ],
};

export function Sidebar({
  role,
  fullName,
  cellNumber,
}: {
  role: Role;
  fullName: string;
  cellNumber?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const items = NAV[role] ?? [];

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-edge bg-panel/60 backdrop-blur lg:w-64">
      {/* brand */}
      <Link href="/dashboard" className="flex items-center gap-3 border-b border-edge px-3 py-4 lg:px-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-cyan/60 bg-cyan/10 font-display text-sm font-bold text-cyan shadow-neonSm">
          E
        </span>
        <span className="hidden lg:block">
          <span className="font-display text-sm uppercase tracking-[0.3em] text-ink">EDULINK</span>
          <span className="block text-[10px] uppercase tracking-widest text-ghost">
            k2020.org.za
          </span>
        </span>
      </Link>

      {/* nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4 lg:px-3">
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md border px-3 py-2.5 text-xs transition",
                active
                  ? "border-cyan/50 bg-cyan/10 text-cyan shadow-neonSm"
                  : "border-transparent text-ghost hover:border-edge hover:bg-panel2 hover:text-ink",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden lg:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* identity */}
      <div className="border-t border-edge p-3 lg:p-4">
        <p className="hidden truncate text-xs font-medium text-ink lg:block">{fullName}</p>
        <p className="mono-num hidden text-[10px] text-cyan/70 lg:block">{maskCell(cellNumber)}</p>
        <button
          onClick={signOut}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-edge px-2 py-2 text-[11px] text-ghost transition hover:border-crimson/50 hover:text-crimson lg:justify-start lg:px-3"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
