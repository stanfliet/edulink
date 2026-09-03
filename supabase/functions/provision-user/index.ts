// provision-user — admin-only account provisioning (role-scoped, tenant-isolated)
// SUPERADMIN: any role, any school. SCHOOLADMIN: TEACHER/PARENT in own school only.
// Email optional: login handle synthesized from cell number when omitted.
import { corsHandler, json } from "../_shared/cors.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";

const ROLES = new Set(["SUPERADMIN", "SCHOOLADMIN", "TEACHER", "PARENT", "CLINIC_USER", "DSD_USER"]);
const SYNTH_DOMAIN = "phone.edulink.local";

function normalizePhone(raw: string): { digits: string; error: string | null } {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length < 9 || d.length > 15) {
    return { digits: d, error: "cell_number must contain 9-15 digits" };
  }
  let n = d;
  if (n.length === 10 && n.startsWith("0")) n = "27" + n.slice(1);
  else if (n.length === 9) n = "27" + n;
  return { digits: n, error: null };
}

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789#%";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

Deno.serve(async (req: Request) => {
  const preflight = corsHandler(req);
  if (preflight) return preflight;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Missing Authorization header" }, 401);

    const admin = getAdminClient();
    const { data: callerAuth, error: authErr } = await admin.auth.getUser(jwt);
    if (authErr || !callerAuth?.user) return json({ error: "Invalid session" }, 401);

    const { data: caller, error: profErr } = await admin
      .from("users")
      .select("user_id, role, school_id")
      .eq("user_id", callerAuth.user.id)
      .maybeSingle();
    if (profErr || !caller) return json({ error: "Caller profile not found" }, 403);
    if (caller.role !== "SUPERADMIN" && caller.role !== "SCHOOLADMIN") {
      return json({ error: "Only SCHOOLADMIN / SUPERADMIN may provision accounts" }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Invalid JSON body" }, 400);

    const full_name = String(body.full_name ?? "").trim();
    const role = String(body.role ?? "").trim().toUpperCase();
    const cellRaw = String(body.cell_number ?? "").trim();
    const contactEmail = String(body.email ?? "").trim().toLowerCase();
    const districtZone = String(body.district_zone ?? "WESTERN_CAPE").trim().toUpperCase();
    const linkLearnerIds: string[] = Array.isArray(body.link_learner_ids) ? body.link_learner_ids.map(String) : [];

    if (full_name.length < 2) return json({ error: "full_name is required" }, 400);
    if (!ROLES.has(role)) return json({ error: `Invalid role: ${role}` }, 400);

    const phone = normalizePhone(cellRaw);
    if (phone.error) return json({ error: phone.error }, 400);

    // --- tenant scoping -------------------------------------------------
    let schoolId: string | null = body.school_id ? String(body.school_id) : null;
    if (caller.role === "SCHOOLADMIN") {
      if (role === "SUPERADMIN" || role === "SCHOOLADMIN") {
        return json({ error: "SCHOOLADMIN may only provision TEACHER / PARENT accounts" }, 403);
      }
      schoolId = caller.school_id ?? null;
      if (!schoolId) return json({ error: "Caller has no school tenant" }, 403);
    }
    if (["SCHOOLADMIN", "TEACHER"].includes(role) && !schoolId) {
      return json({ error: `${role} accounts require a school_id` }, 400);
    }
    if (schoolId) {
      const { data: school, error: schoolErr } = await admin
        .from("schools")
        .select("school_id")
        .eq("school_id", schoolId)
        .maybeSingle();
      if (schoolErr || !school) return json({ error: "Unknown school_id" }, 400);
    }

    // --- identity handles ----------------------------------------------
    const loginEmail = contactEmail || `${phone.digits}@${SYNTH_DOMAIN}`;
    if (contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
      return json({ error: "Invalid email address format" }, 400);
    }

    // --- learner linking (PARENT only) ----------------------------------
    if (linkLearnerIds.length > 0 && role !== "PARENT") {
      return json({ error: "link_learner_ids is only valid for PARENT accounts" }, 400);
    }
    if (linkLearnerIds.length > 0) {
      const { data: learners, error: learnersErr } = await admin
        .from("learners")
        .select("learner_id, school_id")
        .in("learner_id", linkLearnerIds);
      if (learnersErr) return json({ error: learnersErr.message }, 400);
      if (!learners || learners.length !== linkLearnerIds.length) {
        return json({ error: "One or more learner_ids not found" }, 400);
      }
      for (const l of learners) {
        if (schoolId && l.school_id !== schoolId) {
          return json({ error: "Learner belongs to a different school tenant" }, 403);
        }
      }
    }

    const password = body.password ? String(body.password) : generatePassword();
    if (password.length < 8) return json({ error: "password must be at least 8 characters" }, 400);

    // --- create auth user (trigger provisions users/parents rows) -------
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: loginEmail,
      password,
      email_confirm: true,
      user_metadata: {
        role,
        full_name,
        cell_number: phone.digits,
        school_id: schoolId ?? undefined,
        district_zone: districtZone,
        contact_email: contactEmail || undefined,
      },
    });
    if (createErr || !created?.user) {
      const msg = createErr?.message ?? "auth user creation failed";
      const friendly = msg.includes("already been registered")
        ? `Login handle ${loginEmail} is already registered`
        : msg;
      return json({ error: friendly }, 409);
    }
    const newUserId = created.user.id;

    // Ensure profile row matches intent (trigger normally handles this)
    await admin
      .from("users")
      .update({ email: contactEmail || null, login_email: loginEmail, cell_number: phone.digits })
      .eq("user_id", newUserId);

    // --- link learners ---------------------------------------------------
    let linked = 0;
    if (linkLearnerIds.length > 0) {
      const { data: parentRow } = await admin
        .from("parents")
        .select("parent_id")
        .eq("user_id", newUserId)
        .maybeSingle();
      if (parentRow?.parent_id) {
        const { data: linkedRows } = await admin
          .from("learners")
          .update({ parent_id: parentRow.parent_id })
          .in("learner_id", linkLearnerIds)
          .select("learner_id");
        linked = linkedRows?.length ?? 0;
      }
    }

    return json({
      ok: true,
      user_id: newUserId,
      role,
      school_id: schoolId,
      full_name,
      cell_number: phone.digits,
      login_email: loginEmail,
      contact_email: contactEmail || null,
      email_is_synthethic: !contactEmail,
      generated_password: body.password ? undefined : password,
      learners_linked: linked,
    }, 201);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
