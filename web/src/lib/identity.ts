export const SYNTH_DOMAIN = "phone.edulink.local";

/** Normalize a cell number to 27XXXXXXXXX (SA country code default). */
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length < 9 || d.length > 15) return null;
  if (d.length === 10 && d.startsWith("0")) return "27" + d.slice(1);
  if (d.length === 9) return "27" + d;
  return d;
}

/** Login handle: an email stays as-is; a phone number maps to its synthesized address. */
export function resolveLoginHandle(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  if (v.includes("@")) {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v.toLowerCase() : null;
  }
  const phone = normalizePhone(v);
  return phone ? `${phone}@${SYNTH_DOMAIN}` : null;
}

export function looksLikePhone(input: string): boolean {
  return !input.includes("@") && input.replace(/\D/g, "").length >= 9;
}
