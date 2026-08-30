"use client";

import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { Activity, AlertTriangle, Users, School } from "lucide-react";

export interface NetworkTotals {
  schools: number;
  learners: number;
  active_cases: number;
  teachers: number;
  parents: number;
  monthly_mrr: number;
  parent_annual: number;
  suspended: number;
  today_absences: number;
}

export function NetworkMetrics({ totals }: { totals: NetworkTotals }) {
  const netRevenue = totals.monthly_mrr + totals.parent_annual;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="Network Revenue (net/mo)"
        value={`R${netRevenue.toLocaleString()}`}
        sub={`MRR R${totals.monthly_mrr.toLocaleString()} · parent loop R${totals.parent_annual.toLocaleString()}`}
        accent="cyan"
      />
      <StatCard
        label="Schools on Network"
        value={String(totals.schools)}
        sub={`${totals.suspended} suspended`}
        accent={totals.suspended > 0 ? "amber" : "cyan"}
        delta={2.4}
      />
      <StatCard
        label="Protected Learners"
        value={totals.learners.toLocaleString()}
        sub={`${totals.teachers} teachers · ${totals.parents} parents`}
        accent="cyan"
      />
      <StatCard
        label="Active DSD Cases"
        value={String(totals.active_cases)}
        sub={`${totals.today_absences} absences today`}
        accent={totals.active_cases > 0 ? "crimson" : "cyan"}
      />
    </div>
  );
}

export function NetworkAlerts({ totals }: { totals: NetworkTotals }) {
  return (
    <Card title="System Health" icon={<Activity className="h-3.5 w-3.5" />}>
      <ul className="space-y-2 text-xs">
        <li className="flex items-center justify-between rounded-md border border-edge bg-void/40 px-3 py-2">
          <span className="flex items-center gap-2 text-ghost">
            <Users className="h-3.5 w-3.5 text-cyan" /> Authentication mesh
          </span>
          <span className="badge-ok">Operational</span>
        </li>
        <li className="flex items-center justify-between rounded-md border border-edge bg-void/40 px-3 py-2">
          <span className="flex items-center gap-2 text-ghost">
            <School className="h-3.5 w-3.5 text-cyan" /> PayFast billing webhook
          </span>
          <span className="badge-ok">Operational</span>
        </li>
        <li className="flex items-center justify-between rounded-md border border-edge bg-void/40 px-3 py-2">
          <span className="flex items-center gap-2 text-ghost">
            <Activity className="h-3.5 w-3.5 text-cyan" /> Render cron (14:00 watchdog)
          </span>
          <span className="badge-ok">Scheduled</span>
        </li>
        {totals.suspended > 0 && (
          <li className="flex items-center justify-between rounded-md border border-crimson/40 bg-crimson/10 px-3 py-2">
            <span className="flex items-center gap-2 text-crimson">
              <AlertTriangle className="h-3.5 w-3.5" /> Suspended tenants require override
            </span>
            <span className="badge-danger">{totals.suspended} tenants</span>
          </li>
        )}
      </ul>
    </Card>
  );
}
