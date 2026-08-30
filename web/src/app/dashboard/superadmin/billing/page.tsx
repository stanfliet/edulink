"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { RoleGate } from "@/components/layout/RoleGate";
import { RouteTransition } from "@/components/layout/RouteTransition";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

interface SchoolRow {
  school_id: string;
  name: string;
  emis_number: string;
  province: string;
  commercial_status: string;
  billing_type: string;
  next_billing_date: string | null;
}

export default function MasterBillingPage() {
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("schools")
      .select("school_id, name, emis_number, province, commercial_status, billing_type, next_billing_date")
      .order("name");
    setSchools((data as SchoolRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function override(school: SchoolRow, status: string) {
    setBusyId(school.school_id);
    setNotice(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("schools")
      .update({ commercial_status: status })
      .eq("school_id", school.school_id);
    if (error) setNotice(`Override failed: ${error.message}`);
    else {
      setNotice(`${school.name} → ${status}`);
      await load();
    }
    setBusyId(null);
  }

  return (
    <RoleGate allowed={["SUPERADMIN"]} title="Master Billing Overrides">
      {() => (
        <RouteTransition>
          <div className="space-y-4 p-4 lg:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="panel-title">Master Billing Override Console</p>
                <p className="mt-1 text-xs text-ghost">
                  R20/month per active non-exempt learner · school portfolio control
                </p>
              </div>
              <div className="flex items-center gap-2">
                {notice && <span className="badge-ok">{notice}</span>}
                <button onClick={load} className="btn-neon text-xs">
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </button>
              </div>
            </div>

            <Card>
              {loading ? (
                <div className="grid h-48 place-items-center text-cyan">
                  <Loader2 className="h-7 w-7 animate-spin" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-edge text-[10px] uppercase tracking-widest text-ghost">
                        <th className="px-3 py-2">School</th>
                        <th className="px-3 py-2">EMIS</th>
                        <th className="px-3 py-2">Province</th>
                        <th className="px-3 py-2">Portfolio</th>
                        <th className="px-3 py-2">Next Billing</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2 text-right">Override</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schools.map((s) => (
                        <tr key={s.school_id} className="border-b border-edge/50 transition hover:bg-panel2/40">
                          <td className="px-3 py-2.5 font-medium text-ink">{s.name}</td>
                          <td className="mono-num px-3 py-2.5 text-ghost">{s.emis_number}</td>
                          <td className="px-3 py-2.5 text-ghost">{s.province}</td>
                          <td className="mono-num px-3 py-2.5 text-cyan">{s.billing_type}</td>
                          <td className="px-3 py-2.5 text-ghost">{formatDate(s.next_billing_date)}</td>
                          <td className="px-3 py-2.5">
                            {s.commercial_status === "ACTIVE" ? (
                              <span className="badge-ok">Active</span>
                            ) : s.commercial_status === "SUSPENDED" ? (
                              <span className="badge-danger">Suspended</span>
                            ) : (
                              <span className="badge-warn">{s.commercial_status}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {s.commercial_status === "ACTIVE" ? (
                              <button
                                disabled={busyId === s.school_id}
                                onClick={() => override(s, "SUSPENDED")}
                                className="btn-danger px-2.5 py-1 text-[10px]"
                              >
                                Suspend
                              </button>
                            ) : (
                              <button
                                disabled={busyId === s.school_id}
                                onClick={() => override(s, "ACTIVE")}
                                className="btn-neon px-2.5 py-1 text-[10px]"
                              >
                                Re-activate
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </RouteTransition>
      )}
    </RoleGate>
  );
}
