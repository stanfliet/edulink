"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { RoleShell } from "./RoleShell";
import { ROLE_HOME, type Role } from "@/lib/utils";

/**
 * Client-side role gate. Renders the role shell once the profile is
 * loaded; redirects users whose role is not permitted on this route.
 */
export function RoleGate({
  allowed,
  title,
  children,
}: {
  allowed: Role[];
  title: string;
  children: (ctx: { role: Role }) => React.ReactNode;
}) {
  const { profile, loading } = useProfile();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile && !allowed.includes(profile.role)) {
      router.replace(ROLE_HOME[profile.role] ?? "/dashboard");
    }
  }, [loading, profile, allowed, router]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-3 text-cyan">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="font-display text-xs uppercase tracking-[0.3em]">
            Authenticating session
          </span>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="panel max-w-sm p-6 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-crimson" />
          <p className="mt-3 font-display text-sm uppercase tracking-widest text-crimson">
            Access denied
          </p>
          <p className="mt-2 text-xs text-ghost">
            Your profile could not be resolved. Contact the Platform Operations Director.
          </p>
        </div>
      </div>
    );
  }

  return (
    <RoleShell
      role={profile.role}
      fullName={profile.full_name}
      cellNumber={profile.cell_number}
      title={title}
    >
      {children({ role: profile.role })}
    </RoleShell>
  );
}
