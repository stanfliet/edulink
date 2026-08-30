"use client";

import { useEffect, useState } from "react";
import { Loader2, History } from "lucide-react";
import { RoleGate } from "@/components/layout/RoleGate";
import { RouteTransition } from "@/components/layout/RouteTransition";
import { Card } from "@/components/ui/Card";
import { IngestZone } from "@/components/schooladmin/IngestZone";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";

export default function IngestConsolePage() {
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [history, setHistory] = useState<unknown[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function loadHistory(sid: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("data_imports")
      .select("import_id, file_name, source_system, rows_parsed, rows_created, rows_updated, errors, status, created_at")
      .eq("school_id", sid)
      .order("created_at", { ascending: false })
      .limit(12);
    setHistory(data ?? []);
  }

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("users")
        .select("school_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const sid = profile?.school_id as string;
      setSchoolId(sid);
      if (sid) await loadHistory(sid);
      setLoaded(true);
    })();
  }, []);

  return (
    <RoleGate allowed={["SCHOOLADMIN"]} title="Data Ingestion Console">
      {() => (
        <RouteTransition>
          <div className="space-y-4 p-4 lg:p-8">
            <div>
              <p className="panel-title">SA-SAMS & CEMIS Ingestion</p>
              <p className="mt-1 text-xs text-ghost">
                Header auto-mapping · clean deduplication · audit trail
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-5">
              <Card className="lg:col-span-3">
                {loaded && schoolId ? (
                  <IngestZone schoolId={schoolId} />
                ) : (
                  <div className="grid h-48 place-items-center text-cyan">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                )}
              </Card>

              <Card
                title="Import History"
                icon={<History className="h-3.5 w-3.5" />}
                className="lg:col-span-2"
              >
                {!loaded ? (
                  <div className="grid h-40 place-items-center text-cyan">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : history.length === 0 ? (
                  <p className="text-xs text-ghost">No imports yet.</p>
                ) : (
                  <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                    {(history as Array<{
                      import_id: string;
                      file_name: string;
                      source_system: string;
                      rows_parsed: number;
                      rows_created: number;
                      rows_updated: number;
                      errors: unknown;
                      status: string;
                      created_at: string;
                    }>).map((h) => (
                      <li key={h.import_id} className="rounded-md border border-edge bg-void/40 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[11px] font-medium text-ink">{h.file_name}</p>
                          {h.status === "COMPLETED" ? (
                            <span className="badge-ok">{h.status}</span>
                          ) : h.status === "FAILED" ? (
                            <span className="badge-danger">{h.status}</span>
                          ) : (
                            <span className="badge-warn">{h.status}</span>
                          )}
                        </div>
                        <p className="mono-num mt-1 text-[10px] text-ghost">
                          {h.source_system} · parsed {h.rows_parsed} · +{h.rows_created} / ~{h.rows_updated}
                        </p>
                        <p className="text-[10px] text-ghost">{formatDateTime(h.created_at)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </RouteTransition>
      )}
    </RoleGate>
  );
}
