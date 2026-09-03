"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AtSign,
  CheckCircle2,
  KeyRound,
  Link2,
  Loader2,
  MailCheck,
  School,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { normalizePhone } from "@/lib/identity";
import { LegalFooter } from "@/components/layout/Footer";

interface SchoolOption {
  school_id: string;
  name: string;
  emis_number: string;
}

type Step = "details" | "verify" | "done";

const PROD_ORIGIN = "https://edulink-beta.vercel.app";

/**
 * Parent self-registration with email verification:
 * 1. Details + verification email (signInWithOtp creates the auth user; the DB
 *    trigger provisions the users/parents rows from the metadata).
 * 2. Email check — the confirmation link returns to this page (PKCE auto
 *    exchange) and finalization runs automatically. A pasted link or code
 *    (verifyOtp) is accepted as a manual fallback.
 * 3. Password is set client-side, then register-finalize binds the cell
 *    number + school tenant.
 */
export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");

  const [fullName, setFullName] = useState("");
  const [cell, setCell] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const finalizingRef = useRef(false);

  const normalizedCell = useCallback(
    () => (cell.trim() ? normalizePhone(cell) : true),
    [cell],
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/register-finalize`,
          {
            headers: {
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}`,
            },
          },
        );
        if (!res.ok) return;
        const body = (await res.json()) as { schools?: SchoolOption[] };
        setSchools(body.schools ?? []);
      } catch {
        /* directory stays empty on failure; school is still validated server-side */
      }
    })();
  }, []);

  const finalize = useCallback(
    async (supabase: ReturnType<typeof createClient>) => {
      if (finalizingRef.current) return;
      finalizingRef.current = true;
      setError(null);
      setBusy(true);
      try {
        const { error: pwError } = await supabase.auth.updateUser({ password });
        if (pwError) throw new Error(pwError.message);

        const cellDigits = cell.trim() ? normalizePhone(cell) : null;
        const session = await supabase.auth.getSession();
        const jwt = session.data.session?.access_token;
        if (!jwt) throw new Error("Session could not be resolved — try signing in.");

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/register-finalize`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${jwt}`,
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
            },
            body: JSON.stringify({
              full_name: fullName.trim(),
              school_id: schoolId,
              cell_number: cellDigits ?? "",
            }),
          },
        );
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) {
          throw new Error(body?.error ?? `Registration finalization failed (HTTP ${res.status})`);
        }

        setStep("done");
        router.push("/dashboard");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setBusy(false);
        finalizingRef.current = false;
      }
    },
    [cell, fullName, schoolId, router],
  );

  // The email confirmation link returns here with a PKCE code which
  // supabase-js exchanges automatically — pick up the session and finish.
  useEffect(() => {
    if (step !== "verify") return;
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") {
        void finalize(supabase);
      }
    });
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) void finalize(supabase);
    });
    return () => data.subscription.unsubscribe();
  }, [step, finalize]);

  async function requestVerification(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (fullName.trim().length < 2) return setError("Enter your full name.");
    if (!schoolId) return setError("Select your school.");
    if (!email.trim() || !email.includes("@")) {
      return setError("A contact email is required — the verification link is sent there.");
    }
    if (normalizedCell() === null) return setError("Enter a valid cell number (e.g. 082 123 4567).");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");

    setBusy(true);
    const supabase = createClient();
    const cellDigits = cell.trim() ? normalizePhone(cell) : null;
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        // Lands back on this page (production origin is allow-listed).
        emailRedirectTo: `${PROD_ORIGIN}/register`,
        data: {
          role: "PARENT",
          full_name: fullName.trim(),
          cell_number: cellDigits ?? undefined,
          school_id: schoolId,
          contact_email: email.trim(),
        },
      },
    });
    setBusy(false);
    if (otpError) return setError(otpError.message);
    setStep("verify");
    setInfo(`Verification link sent to ${email.trim()}. Open it on this device to finish automatically.`);
  }

  async function verifyManual(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();

    // Accept a pasted confirmation link (extract the token) or a raw code.
    let token = manual.trim();
    const tokenMatch = token.match(/[?&]token=([^&#\s]+)/);
    if (tokenMatch) token = tokenMatch[1];
    if (!token) {
      setBusy(false);
      return setError("Paste the verification link or code from the email.");
    }

    // New signups receive the confirmation template; existing accounts the
    // magic-link one — accept either token type.
    let verify = await supabase.auth.verifyOtp({ email: email.trim(), token, type: "signup" });
    if (verify.error) {
      verify = await supabase.auth.verifyOtp({ email: email.trim(), token, type: "magiclink" });
    }
    if (verify.error) {
      setBusy(false);
      return setError(verify.error.message);
    }
    setBusy(false);
    await finalize(supabase);
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
                <p className="font-display text-sm uppercase tracking-[0.3em] text-ink">EDULINK</p>
                <p className="text-[10px] uppercase tracking-widest text-ghost">
                  {step === "verify" ? "Verify your email" : "Parent Registration"}
                </p>
              </div>
            </div>

            {step === "details" && (
              <form onSubmit={requestVerification} className="space-y-4">
                <label className="block">
                  <span className="label">Full name</span>
                  <span className="relative mt-1 block">
                    <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ghost" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Name and surname"
                      className="neon-input pl-9"
                      autoComplete="name"
                    />
                  </span>
                </label>

                <label className="block">
                  <span className="label">School</span>
                  <span className="relative mt-1 block">
                    <School className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ghost" />
                    <select
                      required
                      value={schoolId}
                      onChange={(e) => setSchoolId(e.target.value)}
                      className="neon-input pl-9"
                    >
                      <option value="">Select your school…</option>
                      {schools.map((s) => (
                        <option key={s.school_id} value={s.school_id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>

                <label className="block">
                  <span className="label">Cell number (optional)</span>
                  <span className="relative mt-1 block">
                    <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ghost" />
                    <input
                      type="tel"
                      value={cell}
                      onChange={(e) => setCell(e.target.value)}
                      placeholder="082 123 4567"
                      className="neon-input pl-9"
                      autoComplete="tel"
                    />
                  </span>
                </label>

                <label className="block">
                  <span className="label">Contact email — verification link goes here</span>
                  <span className="relative mt-1 block">
                    <MailCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ghost" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.co.za"
                      className="neon-input pl-9"
                      autoComplete="email"
                    />
                  </span>
                </label>

                <label className="block">
                  <span className="label">Password (min 8 characters)</span>
                  <span className="relative mt-1 block">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ghost" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="neon-input pl-9"
                      autoComplete="new-password"
                    />
                  </span>
                </label>

                <label className="block">
                  <span className="label">Confirm password</span>
                  <span className="relative mt-1 block">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ghost" />
                    <input
                      type="password"
                      required
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="••••••••"
                      className="neon-input pl-9"
                      autoComplete="new-password"
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
                  {busy ? "Sending…" : "Send verification email"}
                </button>
              </form>
            )}

            {step === "verify" && (
              <div className="space-y-4">
                <p className="rounded-md border border-cyan/40 bg-cyan/5 px-3 py-2 text-xs text-cyan">{info}</p>

                <form onSubmit={verifyManual} className="space-y-3">
                  <label className="block">
                    <span className="label">Paste the verification link (or code) from the email</span>
                    <span className="relative mt-1 block">
                      <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ghost" />
                      <input
                        type="text"
                        required
                        value={manual}
                        onChange={(e) => setManual(e.target.value)}
                        placeholder="https://…verify?token=… or code"
                        className="neon-input pl-9"
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
                    {busy ? "Verifying…" : "Verify & create account"}
                  </button>
                </form>

                <button
                  type="button"
                  disabled={busy}
                  onClick={requestVerification}
                  className="w-full text-center text-[11px] text-ghost hover:text-cyan"
                >
                  Didn&apos;t receive it? Resend email
                </button>
              </div>
            )}

            {step === "done" && (
              <p className="flex items-center gap-2 text-xs text-cyan">
                <CheckCircle2 className="h-4 w-4" /> Account created — redirecting…
              </p>
            )}

            <p className="mt-5 text-center text-[10px] leading-relaxed text-ghost">
              Registration creates a PARENT account bound to your school. Staff accounts are
              provisioned by the school administrator. Your cell number is optional — when absent,
              sign in with the verified email address.
            </p>
          </div>

          <p className="mt-4 text-center">
            <Link href="/login" className="text-[11px] text-cyan/80 hover:text-cyan">
              Already registered? Sign in →
            </Link>
          </p>
        </div>
      </div>
      <LegalFooter />
    </div>
  );
}
