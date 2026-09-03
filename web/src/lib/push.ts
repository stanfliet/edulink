"use client";

import { createClient } from "@/lib/supabase/client";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/push-dispatch`,
      {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}`,
        },
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { publicKey?: string };
    return body.publicKey ?? null;
  } catch {
    return null;
  }
}

export type PushStatus =
  | "idle"
  | "unsupported"
  | "denied"
  | "subscribed"
  | "already-subscribed"
  | "error";

/**
 * Registers the service worker, asks permission, subscribes the browser to
 * Web Push and upserts the subscription row for the signed-in user.
 */
export async function ensurePushSubscription(userId: string): Promise<PushStatus> {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";

  const permission = Notification.requestPermission();
  if (await permission !== "granted") return "denied";

  const [publicKey, registration] = await Promise.all([
    getVapidPublicKey(),
    navigator.serviceWorker.register("/sw.js"),
  ]);
  if (!publicKey) throw new Error("Push is not configured (missing VAPID key)");

  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  const json = subscription.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("Subscription payload incomplete");
  }

  const supabase = createClient();
  const row = {
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    user_agent: navigator.userAgent,
  };
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(row, { onConflict: "endpoint" });
  if (error) throw new Error(error.message);

  return existing ? "already-subscribed" : "subscribed";
}
