// ============================================================
// EDULINK · payfast-billing-webhook
// Processes PayFast ITN callbacks.
//
//   SCHOOL portfolio : R20 / month per active NON-EXEMPT learner
//   PARENT loop      : R100 / year per profile
//
// Application lockouts apply when status reads PAST_DUE, and are
// bypassed entirely when exempt_status = TRUE (both enforced here
// and in the get_access_eligibility() RPC).
//
// Security:
//   - verify_jwt = false (PayFast has no JWT)
//   - live-mode server-to-server ITN validation + signature check
//   - idempotent on provider_payment_id (billing_events unique index)
//   - all writes via service role; entity scope derived from item_name
// ============================================================
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { existingEvent } from "../_shared/idempotency.ts";
import { corsHandler, json } from "../_shared/cors.ts";

function parseForm(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of body.split("&")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const k = decodeURIComponent(pair.slice(0, idx).replace(/\+/g, " "));
    const v = decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, " "));
    out[k] = v;
  }
  return out;
}

// PayFast signature: sort params (excluding pf_signature), concatenate
// key=value pairs (url-decoded, spaces as '+'), append passphrase, md5.
function buildSignature(data: Record<string, string>, passphrase: string): string {
  const keys = Object.keys(data)
    .filter((k) => k !== "pf_signature")
    .sort();
  let str = "";
  for (const k of keys) {
    if (data[k] !== "" && data[k] != null) {
      str += `${k}=${decodeURIComponent(data[k]).replace(/ /g, "+")}&`;
    }
  }
  str = str.slice(0, -1);
  if (passphrase) str += `&passphrase=${encodeURIComponent(passphrase.trim())}`;
  return str;
}

async function md5Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("MD5", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const pre = corsHandler(req);
  if (pre) return pre;

  try {
    const raw = await req.text();
    const data = parseForm(raw);
    const sb = getAdminClient();

    const passphrase = Deno.env.get("PAYFAST_PASSPHRASE") ?? "";
    const sandbox = (Deno.env.get("PAYFAST_SANDBOX") ?? "true") === "true";

    // 1) live-mode server verification (PayFast origin check)
    if (!sandbox) {
      const vres = await fetch("https://www.payfast.co.za/eng/query/validate", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(data).toString(),
      });
      const verdict = (await vres.text()).trim().toUpperCase();
      if (verdict !== "VALID") return json({ ok: false, error: "INVALID_ITN" }, 400);
    }

    // 2) signature check
    const sig = await md5Hex(buildSignature(data, passphrase));
    if (data.pf_signature && sig !== data.pf_signature.toLowerCase()) {
      console.error("signature mismatch", { got: sig, expected: data.pf_signature });
      return json({ ok: false, error: "BAD_SIGNATURE" }, 400);
    }

    // 3) idempotency — replay protection
    const paymentId = data.pf_payment_id ?? data.m_payment_id;
    if (paymentId && (await existingEvent(sb, String(paymentId)))) {
      return json({ ok: true, duplicate: true }, 200);
    }

    const status = (data.pf_payment_status ?? "").toUpperCase();
    const amount = parseInt(data.amount_gross ?? "0", 10);
    const itemName = (data.item_name ?? "").toUpperCase();

    const isSchool = itemName.includes("SCHOOL");
    const entityType: "SCHOOL" | "PARENT" = isSchool ? "SCHOOL" : "PARENT";
    // custom_int1 = school_id, custom_int2 = parent_id (set at redirect)
    const entityId = (isSchool ? data.custom_int1 : data.custom_int2) ?? "";

    // 4) audit record
    await sb.from("billing_events").insert({
      provider: "PAYFAST",
      provider_payment_id: paymentId ? String(paymentId) : undefined,
      entity_type: entityType,
      entity_id: entityId || undefined,
      amount_charged: amount,
      status,
      raw_payload: data,
    });

    // 5) portfolio updates
    if (status === "COMPLETE") {
      if (entityType === "SCHOOL") {
        // R20 x active non-exempt learners — recomputed by the RPC
        const { error: errRec } = await sb.rpc("reconcile_school_billing", {
          p_school_id: entityId,
        });
        if (errRec) console.error("reconcile_school_billing:", errRec.message);

        await sb
          .from("schools")
          .update({ commercial_status: "ACTIVE", billing_type: "R20_MONTHLY" })
          .eq("school_id", entityId);
      } else {
        // PARENT loop — R100 / year
        const { error: errPaid } = await sb.rpc("mark_parent_subscription_paid", {
          p_parent_id: entityId,
          p_payment_reference: String(paymentId ?? "PAYFAST"),
          p_amount: amount,
        });
        if (errPaid) console.error("mark_parent_subscription_paid:", errPaid.message);
      }
    } else if (["CANCELLED", "FAILED"].includes(status) && entityType === "PARENT") {
      // Only degrade if NOT covered by an exempt learner
      const { data: exempt } = await sb
        .from("learners")
        .select("learner_id")
        .eq("parent_id", entityId)
        .eq("exempt_status", true)
        .limit(1);
      if ((exempt?.length ?? 0) === 0) {
        await sb
          .from("parents")
          .update({ billing_status: "PAST_DUE" })
          .eq("parent_id", entityId);
      }
    }

    return json({ ok: true, status }, 200);
  } catch (err) {
    console.error("payfast webhook error", err);
    return json({ ok: false, error: "WEBHOOK_FAILURE" }, 500);
  }
});
