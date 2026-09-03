"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Loader2, Search, ShieldCheck, UserPlus, X } from "lucide-react";
import { invokeFunction } from "@/lib/supabase/functions";
import { normalizePhone, SYNTH_DOMAIN } from "@/lib/identity";
import { ROLE_LABELS, type Role } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const ALL_ROLES: Role[] = ["SUPERADMIN", "SCHOOLADMIN", "TEACHER", "PARENT", "CLINIC_USER", "DSD_USER"];
const SCHOOL_ROLES: Role[] = ["TEACHER", "PARENT"];

interface SchoolOption {
  school_id: string;
  name: string;
}

interface LearnerOption {
  learner_id: string;
  first_name: string;
  last_name: string;
  grade: number;
  class_section: string;
}

interface ProvisionResult {
  ok: boolean;
  user_id: string;
  role: Role;
  full_name: string;
  cell_number: string;
  login_email: string;
  contact_email: string | null;
  email_is_synthethic: boolean;
  generated_password?: string;
  learners_linked: number;
}

/**
 * Admin account provisioning — role-scoped and tenant-isolated.
 * SUPERADMIN: any role, any school. SCHOOLADMIN: TEACHER/PARENT in own school.
 * Phone is mandatory; contact email is optional — a login handle is
 * synthesized from the cell number when no email is provided.
 */
export function ProvisionAccounts({
  callerRole,
  callerSchoolId,
}: {
  callerRole: "SUPERADMIN" | "SCHOOLADMIN";
  callerSchoolId: string | null;
}) {
  const isSuper = callerRole === "SUPERADMIN";
  const allowedRoles = isSuper ? ALL_ROLES : SCHOOL_ROLES;

  const [role, setRole] = useState<Role>("PARENT");
  const [fullName, setFullName] = useState("");
  const [cell, setCell] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [schoolId, setSchoolId] = useState<string>(callerSchoolId ?? "");
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [zone, setZone] = useState("WESTERN_CAPE");

  // learner linker (PARENT only)
  const [learnerQuery, setLearnerQuery] = useState("");
  const [learnerHits, setLearnerHits] = useState<LearnerOption[]>([]);
  const [linked, setLinked] = useState<LearnerOption[]>([]);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const effectiveSchool = isSuper ? schoolId : callerSchoolId ?? "";
  const normalized = useMemo(() => (cell ? normalizePhone(cell) : null), [cell]);
  const synthHandle = normalized ? `${normalized}@${SYNTH_DOMAIN}` : null;

  // SUPERADMIN: school directory for the tenant picker
  useEffect(() => {
    if (!isSuper) return;
    const supabase = createClient();
    supabase
      .from("schools")
      .select("school_id, name")
      .order("name")
      .then(({ data }) => setSchools((data as SchoolOption[]) ?? []));
  }, [isSuper]);

  // learner search, scoped to the effective tenant
  useEffect(() => {
    if (role !== "PARENT" || !effectiveSchool || learnerQuery.trim().length < 2) {
      setLearnerHits([]);
      return;
    }
    const supabase = createClient();
    const q = learnerQuery.trim();
    const t = setTimeout(() => {
      supabase
        .from("learners")
        .select("learner_id, first_name, last_name, grade, class_section")
        .eq("school_id", effectiveSchool)
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
        .limit(8)
        .then(({ data }) =>
          setLearnerHits(
            ((data as LearnerOption[]) ?? []).filter((l) => !linked.some((x) => x.learner_id === l.learner_id)),
          ),
        );
    }, 250);
    return () => clearTimeout(t);
  }, [learnerQuery, role, effectiveSchool, linked]);

  function toggleLinked(l: LearnerOption) {
    setLinked((prev) =>
      prev.some((x) => x.learner_id === l.learner_id)
        ? prev.filter((x) => x.learner_id !== l.learner_id)
        : [...prev, l],
    );
    setLearnerQuery("");
    setLearnerHits([]);
  }

  async function provision() {
    setBusy(true);
    setError(null);
    setResult(null);
    setCopied(false);

    const payload: Record<string, unknown> = {
      full_name: fullName.trim(),
      role,
      cell_number: cell,
      district_zone: zone.trim() || "WESTERN_CAPE",
    };
    if (email.trim()) payload.email = email.trim();
    if (password.trim()) payload.password = password.trim();
    if (effectiveSchool) payload.school_id = effectiveSchool;
    if (role === "PARENT" && linked.length > 0) {
      payload.link_learner_ids = linked.map((l) => l.learner_id);
    }

    const { data, error: fnError } = await invokeFunction<ProvisionResult>("provision-user", payload);
    if (fnError || !data?.ok) {
      setError(fnError ?? "Provisioning failed");
    } else {
      setResult(data);
      setFullName("");
      setCell("");
      setEmail("");
      setPassword("");
      setLinked([]);
      setLearnerQuery("");
    }
    setBusy(false);
  }

  const canSubmit =
    fullName.trim().length >= 2 &&
    !!normalized &&
    (!SCHOOL_ROLES.includes(role) || !!effectiveSchool);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ---------------- form ---------------- */}
      <div className="space-y-3">
        <div>
          <span className="label">Full name</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Thandi Mokoena" className="neon-input" />
        </div>

        <div>
          <span className="label">Account role</span>
          <div className="flex flex-wrap gap-1.5">
            {allowedRoles.map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-wider transition ${
                  role === r ? "border-cyan/60 bg-cyan/15 text-cyan" : "border-edge text-ghost hover:text-ink"
                }`}
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Cell number (login identity)</span>
          <input value={cell} onChange={(e) => setCell(e.target.value)} placeholder="082 123 4567" className="neon-input" inputMode="tel" />
          <p className="mt-1 text-[10px] text-ghost">
            {normalized
              ? `Login handle: ${synthHandle}${email.trim() ? "" : "  (phone-only — no email needed)"}`
              : "9–15 digits; SA numbers normalize to +27."}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className="label">Contact email (optional)</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@home.co.za" className="neon-input" type="email" />
          </div>
          <div>
            <span className="label">Password (optional)</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Auto-generated if blank" className="neon-input" />
          </div>
        </div>

        {isSuper ? (
          <div>
            <span className="label">School tenant</span>
            <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} className="neon-input">
              <option value="">— select school —</option>
              {schools.map((s) => (
                <option key={s.school_id} value={s.school_id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-[10px] text-ghost">
            <ShieldCheck className="h-3.5 w-3.5 text-cyan" />
            Tenant-locked to your school — accounts can only be created inside your campus.
          </p>
        )}

        {role === "PARENT" && effectiveSchool && (
          <div className="relative">
            <span className="label">Link learners (children)</span>
            <div className="flex items-center gap-2">
              <Search className="pointer-events-none absolute left-3 top-[2.4rem] h-4 w-4 -translate-y-1/2 text-ghost" />
              <input
                value={learnerQuery}
                onChange={(e) => setLearnerQuery(e.target.value)}
                placeholder="Search learners by name…"
                className="neon-input pl-9"
              />
            </div>
            {learnerHits.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-md border border-edge bg-panel shadow-neonSm">
                {learnerHits.map((l) => (
                  <li key={l.learner_id}>
                    <button onClick={() => toggleLinked(l)} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-ink hover:bg-panel2">
                      <span>
                        {l.first_name} {l.last_name}
                      </span>
                      <span className="text-[10px] text-ghost">
                        Grade {l.grade}
                        {l.class_section}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {linked.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {linked.map((l) => (
                  <li key={l.learner_id} className="badge-ok flex items-center gap-1.5">
                    {l.first_name} {l.last_name}
                    <button onClick={() => toggleLinked(l)} aria-label={`Unlink ${l.first_name}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button onClick={provision} disabled={busy || !canSubmit} className="btn-solid text-xs">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          {busy ? "Provisioning…" : "Provision Account"}
        </button>
        {error && <p className="text-xs text-crimson">{error}</p>}
      </div>

      {/* ---------------- result ---------------- */}
      <div>
        {result ? (
          <div className="panel space-y-3 p-4">
            <p className="flex items-center gap-2 font-display text-xs uppercase tracking-widest text-cyan">
              <ShieldCheck className="h-4 w-4" /> Account provisioned
            </p>
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-ghost">Name</dt>
                <dd className="text-ink">{result.full_name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ghost">Role</dt>
                <dd className="text-ink">{ROLE_LABELS[result.role] ?? result.role}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ghost">Cell</dt>
                <dd className="text-ink">{result.cell_number}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ghost">Login handle</dt>
                <dd className="font-mono text-[11px] text-ink">{result.login_email}</dd>
              </div>
              {result.generated_password && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ghost">Password</dt>
                  <dd className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-ink">{result.generated_password}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(result.generated_password ?? "");
                        setCopied(true);
                      }}
                      className="text-ghost hover:text-cyan"
                      aria-label="Copy password"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-cyan" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-ghost">Learners linked</dt>
                <dd className="text-ink">{result.learners_linked}</dd>
              </div>
            </dl>
            <p className="text-[10px] leading-relaxed text-ghost">
              Share these credentials with the account holder over a secure channel. They sign in with
              {result.email_is_synthethic ? " their cell number" : " this email or their cell number"} on the login page.
            </p>
          </div>
        ) : (
          <div className="panel space-y-2 p-4 text-xs text-ghost">
            <p className="font-display text-xs uppercase tracking-widest text-ink">Provisioning rules</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>Cell number is mandatory; email optional — phone-only accounts sign in with their number.</li>
              <li>{isSuper ? "SuperAdmin may create any role in any school tenant." : "SchoolAdmin may create Teacher and Parent accounts inside their own school only."}</li>
              <li>Parent accounts may be linked to one or more learners at provisioning time.</li>
              <li>Passwords are generated server-side and shown once — copy them now.</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
