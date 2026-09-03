// register-finalize — completes self-registration (OTP-verified PARENT accounts)
//   GET  (any apikey) -> public school directory { schools: [{school_id, name, emis_number}] }
//   POST (user session, OTP-verified) -> binds cell/school to the caller's profile
// Flow: the client does signInWithOtp (creates auth user; trigger creates the
// users row), verifyOtp (confirms email), updateUser({password}), then calls
// POST here to bind the cell number + school tenant and ensure the parents row.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://vfjskqklfavhhltsaicr.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SYNTH_DOMAIN = "phone.edulink.local";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function normalizePhone(raw: string): { digits: string; error: string | null } {
  const d = raw.replace(/\D/g, "");
  if (d.length < 9 || d.length > 15) return { digits: "", error: "cell_number must contain 9-15 digits" };
  let n = d;
  if (n.length === 10 && n.startsWith("0")) n = "27" + n.slice(1);
  else if (n.length === 9) n = "27" + n;
  return { digits: n, error: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Public school directory for the registration / admin pickers.
  if (req.method === "GET") {
    const { data, error } = await admin
      .from("schools")
      .select("school_id, name, emis_number")
      .eq("commercial_status", "ACTIVE")
      .order("name");
    if (error) return json({ error: error.message }, 400);
    return json({ schools: data ?? [] });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Missing Authorization header" }, 401);

  const { data: authData, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !authData?.user) return json({ error: "Invalid session" }, 401);
  const user = authData.user;
  if (!user.email) return json({ error: "Account has no verified email" }, 400);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // --- caller profile (created by handle_new_user trigger) ---------------
  const { data: profile, error: profErr } = await admin
    .from("users")
    .select("user_id, role, school_id, cell_number")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profErr) return json({ error: profErr.message }, 400);
  if (!profile) return json({ error: "Profile row missing — contact support" }, 404);
  if (profile.role !== "PARENT") {
    return json({ error: "Self-registration is only for PARENT accounts" }, 403);
  }
  if (profile.school_id) {
    return json({ error: "Account is already bound to a school — sign in instead", login_email: user.email }, 409);
  }

  // --- inputs ------------------------------------------------------------
  const fullName = String(body.full_name ?? "").trim();
  const schoolId = String(body.school_id ?? "").trim();
  const cellRaw = String(body.cell_number ?? "").trim();

  if (fullName.length < 2) return json({ error: "full_name is required" }, 400);
  if (!schoolId) return json({ error: "school_id is required" }, 400);

  let cellDigits: string | null = null;
  if (cellRaw) {
    const phone = normalizePhone(cellRaw);
    if (phone.error) return json({ error: phone.error }, 400);

    // Duplicate-cell guard (informational; cell is not a unique column)
    const { data: dupe } = await admin
      .from("users")
      .select("user_id")
      .eq("cell_number", phone.digits)
      .neq("user_id", user.id)
      .limit(1);
    if (dupe && dupe.length > 0) {
      return json({ error: "This cell number is already registered — sign in instead" }, 409);
    }
    cellDigits = phone.digits;
  }

  const { data: school, error: schoolErr } = await admin
    .from("schools")
    .select("school_id")
    .eq("school_id", schoolId)
    .maybeSingle();
  if (schoolErr || !school) return json({ error: "Unknown school_id" }, 400);

  // --- bind profile --------------------------------------------------------
  // login_email stays equal to the auth email (the verified OTP email), which
  // is the working login handle; phone-first accounts provisioned by admins
  // keep their synthetic handle instead.
  const { error: updErr } = await admin
    .from("users")
    .update({
      full_name: fullName,
      school_id: schoolId,
      cell_number: cellDigits ?? profile.cell_number,
      email: user.email,
      login_email: user.email,
      district_zone: "WESTERN_CAPE",
    })
    .eq("user_id", user.id);
  if (updErr) return json({ error: updErr.message }, 400);

  // Ensure the parents billing row exists
  const { data: parentRow } = await admin
    .from("parents")
    .select("parent_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!parentRow) {
    await admin.from("parents").insert({ user_id: user.id });
  }

  return json({
    ok: true,
    user_id: user.id,
    full_name: fullName,
    school_id: schoolId,
    cell_number: cellDigits,
    login_email: user.email,
    synth_handle: cellDigits ? `${cellDigits}@${SYNTH_DOMAIN}` : null,
    note: "Sign in with the verified email address. Cell login handles are reserved for admin-provisioned phone-only accounts.",
  });
});
