"use client";

import { MapPin } from "lucide-react";
import { motion } from "framer-motion";

interface ProvinceDatum {
  province: string;
  schools: number;
}

const PROVINCES: Record<string, { x: number; y: number }> = {
  "Western Cape": { x: 18, y: 68 },
  "Eastern Cape": { x: 46, y: 62 },
  "Northern Cape": { x: 26, y: 30 },
  "Free State": { x: 48, y: 38 },
  "North West": { x: 44, y: 24 },
  "Gauteng": { x: 57, y: 22 },
  "Limpopo": { x: 66, y: 12 },
  "Mpumalanga": { x: 66, y: 28 },
  "KwaZulu-Natal": { x: 66, y: 48 },
};

const OUTLINE =
  "M8 62 L12 58 L16 60 L20 58 L24 60 L28 56 L30 60 L34 58 L38 56 L40 60 L44 58 " +
  "L48 54 L52 56 L54 52 L58 54 L60 50 L64 52 L68 48 L70 50 L72 46 L70 42 L72 38 " +
  "L68 36 L70 32 L66 28 L68 24 L64 20 L60 22 L56 18 L52 20 L48 16 L44 20 L40 18 " +
  "L36 22 L32 18 L28 22 L24 20 L20 24 L16 22 L12 26 L14 30 L10 34 L12 38 L8 42 " +
  "L10 46 L8 50 L6 54 L8 58 Z";

/**
 * Stylised South African province distribution plot — neon-node network.
 * Real province coordinates mapped onto a 80x80 canvas; node radius is
 * proportional to school count in that province.
 */
export function SAMap({ data }: { data: ProvinceDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.schools));

  return (
    <div className="relative h-72 w-full">
      <svg viewBox="0 0 80 80" className="h-full w-full">
        {/* country silhouette */}
        <path
          d={OUTLINE}
          fill="rgba(69,162,158,0.04)"
          stroke="rgba(69,162,158,0.35)"
          strokeWidth="0.4"
          strokeDasharray="1.6 1.2"
        />
        {/* link lines from Cape Town hub to each province node */}
        {data.map((d) => {
          const p = PROVINCES[d.province];
          if (!p) return null;
          return (
            <line
              key={`link-${d.province}`}
              x1={18}
              y1={68}
              x2={p.x}
              y2={p.y}
              stroke="rgba(69,162,158,0.25)"
              strokeWidth="0.25"
            />
          );
        })}
        {/* nodes */}
        {data.map((d) => {
          const p = PROVINCES[d.province];
          if (!p) return null;
          const r = 1.6 + (d.schools / max) * 2.4;
          return (
            <g key={`node-${d.province}`}>
              <motion.circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill="rgba(69,162,158,0.18)"
                stroke="#45A29E"
                strokeWidth="0.3"
                initial={{ r: r * 0.4, opacity: 0 }}
                animate={{ r, opacity: 1 }}
                transition={{ duration: 0.6 }}
              />
              <circle cx={p.x} cy={p.y} r={0.6} fill="#66FCF1" className="animate-pulseGlow" />
            </g>
          );
        })}
      </svg>

      {/* legend */}
      <div className="absolute bottom-2 left-2 space-y-1 rounded-md border border-edge bg-void/80 px-3 py-2 text-[10px] backdrop-blur">
        {data.map((d) => {
          const p = PROVINCES[d.province];
          if (!p) return null;
          return (
            <p key={d.province} className="flex items-center gap-2 text-ghost">
              <MapPin className="h-3 w-3 text-cyan" />
              <span className="w-32">{d.province}</span>
              <span className="mono-num text-cyan">{d.schools}</span>
            </p>
          );
        })}
      </div>
    </div>
  );
}
