// push-dispatch — Web Push sender
//   GET  (any key)              -> { publicKey }  VAPID public key for subscription
//   POST (service role only)    -> { notification_id } or { user_ids, title, body, url }
// Resolves recipients from the notification audience and fans out to every
// registered browser subscription. Stale endpoints (404/410) are pruned.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://vfjskqklfavhhltsaicr.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@paarlcyber.co.za";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

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

interface NotifRow {
  notification_id: string;
  school_id: string | null;
  learner_id: string | null;
  audience: string;
  title: string;
  body: string;
  link_url: string | null;
}

type AdminClient = ReturnType<typeof createClient>;

/** Resolve the user_ids that should receive a notification. */
async function recipientsFor(admin: AdminClient, n: NotifRow): Promise<string[]> {
  if (n.audience === "LEARNER" && n.learner_id) {
    // Parent of the learner (learners.parent_id -> parents.user_id)
    const { data } = await admin
      .from("learners")
      .select("parent_id, parents(user_id)")
      .eq("learner_id", n.learner_id)
      .maybeSingle();
    const pid = (
      data as { parent_id: string; parents?: { user_id: string } | null } | null
    )?.parents?.user_id;
    return pid ? [pid] : [];
  }
  if (!n.school_id) return [];
  if (n.audience === "PARENTS") {
    const { data } = await admin
      .from("users")
      .select("user_id")
      .eq("school_id", n.school_id)
      .eq("role", "PARENT");
    return (data ?? []).map((r: { user_id: string }) => r.user_id);
  }
  if (n.audience === "TEACHERS") {
    const { data } = await admin
      .from("users")
      .select("user_id")
      .eq("school_id", n.school_id)
      .in("role", ["TEACHER", "SCHOOLADMIN"]);
    return (data ?? []).map((r: { user_id: string }) => r.user_id);
  }
  // SCHOOL / ALL -> everyone in the tenant
  const { data } = await admin.from("users").select("user_id").eq("school_id", n.school_id);
  return (data ?? []).map((r: { user_id: string }) => r.user_id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Public VAPID key endpoint (any apikey holder may read it — it is public).
  if (req.method === "GET") {
    if (!VAPID_PUBLIC) return json({ error: "VAPID keys not configured" }, 500);
    return json({ publicKey: VAPID_PUBLIC });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  // POST is server-to-server (pg_net trigger / cron / tests): service role only.
  if (bearer !== SERVICE_KEY) return json({ error: "Service role authorization required" }, 403);
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ error: "VAPID keys not configured" }, 500);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let userIds: string[] = [];
  let title = "";
  let pushBody = "";
  let url = "/dashboard";

  if (typeof body.notification_id === "string") {
    const { data: n, error } = await admin
      .from("app_notifications")
      .select("notification_id, school_id, learner_id, audience, title, body, link_url")
      .eq("notification_id", body.notification_id)
      .maybeSingle();
    if (error || !n) return json({ error: error?.message ?? "notification not found" }, 404);
    const row = n as NotifRow;
    userIds = await recipientsFor(admin, row);
    title = row.title;
    pushBody = row.body;
    url = row.link_url ?? "/dashboard/parent/notifications";
  } else if (Array.isArray(body.user_ids) && typeof body.title === "string") {
    userIds = (body.user_ids as unknown[]).map(String);
    title = String(body.title);
    pushBody = String(body.body ?? "");
    url = typeof body.url === "string" ? body.url : "/dashboard";
  } else {
    return json({ error: "Provide notification_id or user_ids + title" }, 400);
  }

  if (userIds.length === 0) return json({ ok: true, recipients: 0, sent: 0, pruned: 0 });

  const { data: subs, error: subsErr } = await admin
    .from("push_subscriptions")
    .select("subscription_id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (subsErr) return json({ error: subsErr.message }, 400);

  const payload = JSON.stringify({ title, body: pushBody, url });
  let sent = 0;
  const stale: string[] = [];

  await Promise.all(
    (subs ?? []).map(
      async (s: { subscription_id: string; endpoint: string; p256dh: string; auth: string }) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          sent += 1;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) stale.push(s.subscription_id);
        }
      },
    ),
  );

  if (stale.length > 0) {
    await admin.from("push_subscriptions").delete().in("subscription_id", stale);
  }

  return json({ ok: true, recipients: userIds.length, sent, pruned: stale.length });
});
