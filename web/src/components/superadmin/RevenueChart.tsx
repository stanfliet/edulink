"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface RevenuePoint {
  month: string;
  mrr: number;
  parent_income: number;
}

/**
 * Real-time net revenue streams — monthly recurring revenue (R20/learner)
 * vs parent annual loop income (R100/profile).
 */
export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#45A29E" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#45A29E" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="parentGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF0055" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#FF0055" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(38,42,56,0.6)" strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            stroke="#9BA3B5"
            tick={{ fill: "#9BA3B5", fontSize: 10 }}
            tickLine={false}
          />
          <YAxis
            stroke="#9BA3B5"
            tick={{ fill: "#9BA3B5", fontSize: 10 }}
            tickLine={false}
            tickFormatter={(v: number) => `R${v}`}
          />
          <Tooltip
            contentStyle={{
              background: "#15171F",
              border: "1px solid #262A38",
              borderRadius: 8,
              fontSize: 11,
            }}
            labelStyle={{ color: "#9BA3B5" }}
            formatter={(value) => [`R${Number(value).toLocaleString()}`, ""]}
          />
          <Area
            type="monotone"
            dataKey="mrr"
            name="MRR (R20/learner)"
            stroke="#45A29E"
            strokeWidth={2}
            fill="url(#mrrGrad)"
          />
          <Area
            type="monotone"
            dataKey="parent_income"
            name="Parent loop (R100/yr)"
            stroke="#FF0055"
            strokeWidth={1.5}
            fill="url(#parentGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
