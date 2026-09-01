"use client";

import { useCallback, useEffect, useState } from "react";
import { HeartPulse, Loader2, Users } from "lucide-react";
import { RoleGate } from "@/components/layout/RoleGate";
import { RouteTransition } from "@/components/layout/RouteTransition";
import { Card } from "@/components/ui/Card";
import { ConsentPanel, type ChildInfo } from "@/components/parent/ConsentPanel";
import { useProfile } from "@/hooks/useProfile";
import { createClient } from "@/lib/supabase/client";

export default function ParentConsentPage() {
  const { profile } = useProfile();
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadChildren = useCallback(async () => {
    if (!profile) return;
    const supabase = createClient();
    const { data: parentRow } = await supabase
      .from("parents")
      .select("parent_id")
      .eq("user_id", profile.user_id)
      .maybeSingle();
    if (!parentRow) {
      setChildren([]);
      return;
    }
    const { data: kids } = await supabase
      .from("learners")
      .select(
        "learner_id, first_name, last_name, grade, class_section, chronic_tag, parent_consent_popia, sa_sams_id, exempt_status",
      )
      .eq("parent_id", parentRow.parent_id);
    setChildren((kids as ChildInfo[]) ?? []);
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      await loadChildren();
      setLoaded(true);
    })();
  }, [profile, loadChildren]);

  const granted = children.filter((c) => c.parent_consent_popia).length;

  return (
    <RoleGate allowed={["PARENT"]} title="Health Net Consent">
      {() => (
        <RouteTransition>
          <div className="space-y-4 p-4 lg:p-8">
            <div>
              <p className="panel-title">Health Net Consent</p>
              <p className="mt-1 text-xs text-ghost">
                POPIA consent — {granted} of {children.length} children granted
              </p>
            </div>

            {!loaded ? (
              <div className="grid h-48 place-items-center text-cyan">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : children.length === 0 ? (
              <div className="panel p-8 text-center">
                <Users className="mx-auto h-10 w-10 text-ghost" />
                <p className="mt-3 text-sm text-ink">No children linked to your profile yet.</p>
                <p className="mt-1 text-xs text-ghost">
                  Contact your school to link your child&apos;s learner profile to this parent account.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {children.map((c) => (
                  <Card
                    key={c.learner_id}
                    title={`${c.first_name} ${c.last_name}`}
                    icon={<HeartPulse className="h-3.5 w-3.5" />}
                  >
                    <p className="mb-2 text-[10px] text-ghost">
                      Grade {c.grade}
                      {c.class_section}
                      {c.chronic_tag ? ` · ${c.chronic_tag}` : ""}
                    </p>
                    <ConsentPanel child={c} onChange={() => void loadChildren()} />
                  </Card>
                ))}
              </div>
            )}
          </div>
        </RouteTransition>
      )}
    </RoleGate>
  );
}