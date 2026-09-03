"use client";

import { UserPlus } from "lucide-react";
import { RoleGate } from "@/components/layout/RoleGate";
import { RouteTransition } from "@/components/layout/RouteTransition";
import { ProvisionAccounts } from "@/components/schooladmin/ProvisionAccounts";
import { useProfile } from "@/hooks/useProfile";

export default function ProvisionPage() {
  const { profile } = useProfile();

  return (
    <RoleGate allowed={["SUPERADMIN", "SCHOOLADMIN"]} title="Account Provisioning">
      {() => (
        <RouteTransition>
          <div className="space-y-4 p-4 lg:p-8">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-md border border-cyan/50 bg-cyan/10 text-cyan shadow-neonSm">
                <UserPlus className="h-5 w-5" />
              </span>
              <div>
                <h1 className="font-display text-lg uppercase tracking-[0.2em] text-ink">Account Provisioning</h1>
                <p className="text-xs text-ghost">
                  Role-scoped and tenant-isolated — accounts are provisioned by school administrators with a cell
                  number; email is optional.
                </p>
              </div>
            </div>

            {profile && (profile.role === "SUPERADMIN" || profile.role === "SCHOOLADMIN") ? (
              <ProvisionAccounts callerRole={profile.role} callerSchoolId={profile.school_id} />
            ) : null}
          </div>
        </RouteTransition>
      )}
    </RoleGate>
  );
}
