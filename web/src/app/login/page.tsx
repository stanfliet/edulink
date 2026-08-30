"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Lock, Mail, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { LegalFooter } from "@/components/layout/Footer";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="cyber-grid relative flex flex-1 items-center justify-center px-6 py-16">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px animate-scan bg-gradient-to-r from-transparent via-cyan/60 to-transparent" />
        <div className="w-full max-w-sm">
          <div className="panel-glow p-8">
            <div className="mb-6 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-md border border-cyan/60 bg-cyan/10 font-display text-base font-bold text-cyan shadow-neonSm">
                E
              </span>
              <div>
                <p className="font-display text-sm uppercase tracking-[0.3em] text-ink">
                  EDULINK
                </p>
                <p className="text-[10px] uppercase tracking-widest text-ghost">
                  Network Authentication
                </p>
              </div>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <label className="block">
                <span className="label">Email address</span>
                <span className="relative mt-1 block">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ghost" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@school.co.za"
                    className="neon-input pl-9"
                    autoComplete="email"
                  />
                </span>
              </label>

              <label className="block">
                <span className="label">Password</span>
                <span className="relative mt-1 block">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ghost" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="neon-input pl-9"
                    autoComplete="current-password"
                  />
                </span>
              </label>

              {error && (
                <p className="flex items-center gap-2 rounded-md border border-crimson/50 bg-crimson/10 px-3 py-2 text-xs text-crimson">
                  <ShieldAlert className="h-4 w-4 shrink-0" /> {error}
                </p>
              )}

              <button type="submit" disabled={busy} className="btn-solid w-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {busy ? "Authenticating…" : "Sign In"}
              </button>
            </form>

            <p className="mt-5 text-center text-[10px] leading-relaxed text-ghost">
              Access is role-scoped and tenant-isolated. Contact the Platform Operations
              Director to provision accounts.
            </p>
          </div>

          <p className="mt-4 text-center">
            <Link href="/" className="text-[11px] text-cyan/80 hover:text-cyan">
              ← Back to k2020.org.za
            </Link>
          </p>
        </div>
      </div>
      <LegalFooter />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
