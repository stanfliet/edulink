"use client";

import { useEffect, useState } from "react";
import { ClipboardPlus, FileHeart, Gavel, Timer } from "lucide-react";
import { RoleGate } from "@/components/layout/RoleGate";
import { RouteTransition } from "@/components/layout/RouteTransition";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { IntakeManager } from "@/components/clinic/IntakeManager";
import { CaseNotebook } from "@/components/clinic/CaseNotebook";
import { Form22Panel } from "@/components/clinic/Form22Panel";
import { Disciplinary72 } from "@/components/clinic/Disciplinary72";
import { useProfile } from "@/hooks/useProfile";
import { createClient } from "@/lib/supabase/client";

interface CaseLite {
  case_id: string;
  case_status: string;
  form_22_filed: boolean;
  trigger_date: string;
}

export default function ClinicDashboard() {
  const { profile } = useProfile();
  const [cases, setCases] = useState<CaseLite[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("dsd_clinic_cases")
      .select("case_id, case_status, form_22_filed, trigger_date")
      .limit(200);
    setCases((data as CaseLite[]) ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, [profile]);

  const openCount = cases.filter((c) => c.case_status !== "RESOLVED").length;
  const intakeQueue = cases.filter((c) => c.case_status === "INBOUND_INTAKE").length;
  const form22Pending = cases.filter((c) => !c.form_22_filed).length;
  const breached = cases.filter(
    (c) => c.case_status !== "RESOLVED" && Date.now() - new Date(c.trigger_date).getTime() > 72 * 3_600_000,
  ).length;

  return (
    <RoleGate allowed={["CLINIC_USER", "DSD_USER"]} title="Agency Case Console">
      {() => (
        <RouteTransition>
          <div className="space-y-4 p-4 lg:p-8">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Open Cases" value={loaded ? String(openCount) : "…"} accent="cyan" />
              <StatCard label="Intake Queue" value={loaded ? String(intakeQueue) : "…"} accent="amber" />
              <StatCard
                label="Form 22 Outstanding"
                value={loaded ? String(form22Pending) : "…"}
                accent={form22Pending > 0 ? "amber" : "cyan"}
              />
              <StatCard
                label="72h Breaches"
                value={loaded ? String(breached) : "…"}
                accent={breached > 0 ? "crimson" : "ghost"}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Card title="Intake Manager" icon={<ClipboardPlus className="h-3.5 w-3.5 text-cyan" />}>
                {profile ? (
                  <IntakeManager
                    workerId={profile.user_id}
                    districtZone={profile.district_zone ?? "UNZONED"}
                    onCreated={load}
                  />
                ) : (
                  <p className="text-xs text-ghost">Loading profile…</p>
                )}
              </Card>

              <Card title="Case Notebook" icon={<FileHeart className="h-3.5 w-3.5 text-cyan" />}>
                {profile ? (
                  <CaseNotebook workerId={profile.user_id} />
                ) : (
                  <p className="text-xs text-ghost">Loading…</p>
                )}
              </Card>

              <div className="space-y-4">
                <Card title="Form 22 Filing" icon={<Gavel className="h-3.5 w-3.5 text-crimson" />}>
                  <Form22Panel />
                </Card>
                <Card title="Statutory Clock" icon={<Timer className="h-3.5 w-3.5 text-cyan" />}>
                  <Disciplinary72 />
                </Card>
              </div>
            </div>
          </div>
        </RouteTransition>
      )}
    </RoleGate>
  );
}
