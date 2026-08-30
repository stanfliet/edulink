import Link from "next/link";
import {
  Activity,
  BookOpen,
  HeartPulse,
  MapPin,
  ShieldCheck,
  Users,
} from "lucide-react";
import { LegalFooter } from "@/components/layout/Footer";

const pillars = [
  {
    icon: BookOpen,
    title: "School Management & LMS",
    body: "Registers, gradebooks, assignments and submissions across every campus tenant.",
  },
  {
    icon: HeartPulse,
    title: "Public Health Tracking Net",
    body: "Chronic badges and clinic escalation — locked behind POPIA consent row isolation.",
  },
  {
    icon: Users,
    title: "Social Services & DSD",
    body: "72-hour disciplinary tracker, Form 22 workflow and caregiver stability indexing.",
  },
  {
    icon: ShieldCheck,
    title: "POPIA-First Architecture",
    body: "Tenant-isolated rows, masked contact data and logged manual override unlocks.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* nav */}
      <header className="border-b border-edge bg-void/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-md border border-cyan/60 bg-cyan/10 font-display text-sm font-bold text-cyan shadow-neonSm">
              E
            </span>
            <span className="font-display text-sm uppercase tracking-[0.3em] text-ink">
              EDULINK
              <span className="ml-2 text-[10px] tracking-[0.2em] text-ghost">
                k2020.org.za
              </span>
            </span>
          </div>
          <Link href="/login" className="btn-neon text-xs">
            Secure Login
          </Link>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <div className="absolute inset-0 cyber-grid" />
          <div className="absolute inset-x-0 top-0 h-px animate-scan bg-gradient-to-r from-transparent via-cyan/70 to-transparent" />
        </div>
        <div className="relative mx-auto max-w-7xl px-6 py-24 text-center">
          <p className="badge-ok mx-auto mb-6">
            <Activity className="h-3 w-3" /> Multi-Tenant School Network · Western Cape
          </p>
          <h1 className="font-display text-3xl font-bold uppercase tracking-[0.2em] text-ink sm:text-5xl">
            One Network.
            <span className="block bg-gradient-to-r from-cyan via-acid to-cyan bg-clip-text text-transparent">
              Every Learner.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-ghost">
            EDULINK unifies school administration, learning management, the public health
            tracking network and social services disciplinary workflows — with strict POPIA
            row isolation protecting every minor-child profile.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/login" className="btn-solid">
              Enter the Network
            </Link>
            <Link href="/dashboard" className="btn-neon">
              Dashboard Access
            </Link>
          </div>
          <div className="mt-14 grid grid-cols-2 gap-3 text-left sm:grid-cols-4">
            {pillars.map((p) => (
              <div key={p.title} className="panel p-4">
                <p.icon className="h-5 w-5 text-cyan" />
                <p className="mt-3 font-display text-[11px] uppercase tracking-widest text-ink">
                  {p.title}
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-ghost">{p.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex items-center justify-center gap-2 text-[11px] text-ghost">
            <MapPin className="h-3.5 w-3.5 text-cyan" />
            Paarl · Stellenbosch · Cape Town · Western Cape, South Africa
          </div>
        </div>
      </section>

      <LegalFooter />
    </div>
  );
}
