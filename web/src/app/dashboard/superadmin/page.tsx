"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { RoleGate } from "@/components/layout/RoleGate";
import { RouteTransition } from "@/components/layout/RouteTransition";
import { Card } from "@/components/ui/Card";
import { SAMap } from "@/components/superadmin/SAMap";
import { RevenueChart, type RevenuePoint } from "@/components/superadmin/RevenueChart";
import { NetworkMetrics, NetworkAlerts, type NetworkTotals } from "@/components/superadmin/NetworkMetrics";
import { createClient } from "@/lib/supabase/client";

interface Metrics {
  totals: NetworkTotals;
  revenue_series: RevenuePoint[];
  province_distribution: { province: string; schools: number }[];
}

export default function SuperAdminDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .rpc("get_network_metrics")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setMetrics(data as Metrics);
      });
  }, []);

  return (
    <RoleGate allowed={["SUPERADMIN"]} title="Network Command">
      {() => (
        <RouteTransition>
          <div className="space-y-4 p-4 lg:p-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="panel-title">Real-time Network Telemetry</p>
                <p className="mt-1 text-xs text-ghost">
                  Geographic distribution · net revenue streams · system metrics
                </p>
              </div>
              {error && <span className="badge-danger">{error}</span>}
            </div>

            {!metrics ? (
              <div className="grid min-h-[40vh] place-items-center text-cyan">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <>
                <NetworkMetrics totals={metrics.totals} />

                <div className="grid gap-4 lg:grid-cols-5">
                  <Card
                    title="Province Distribution Map"
                    icon={<span className="h-2 w-2 rounded-full bg-cyan animate-pulseGlow" />}
                    className="lg:col-span-3"
                  >
                    <SAMap data={metrics.province_distribution} />
                  </Card>
                  <div className="space-y-4 lg:col-span-2">
                    <Card
                      title="Net Revenue Streams — 12mo"
                      icon={<span className="h-2 w-2 rounded-full bg-crimson animate-pulseGlow" />}
                    >
                      <RevenueChart data={metrics.revenue_series} />
                    </Card>
                    <NetworkAlerts totals={metrics.totals} />
                  </div>
                </div>
              </>
            )}
          </div>
        </RouteTransition>
      )}
    </RoleGate>
  );
}
