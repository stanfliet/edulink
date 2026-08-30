export type Role =
  | "SUPERADMIN"
  | "SCHOOLADMIN"
  | "TEACHER"
  | "PARENT"
  | "CLINIC_USER"
  | "DSD_USER";

export const ROLE_LABELS: Record<Role, string> = {
  SUPERADMIN: "SuperAdmin",
  SCHOOLADMIN: "School Admin",
  TEACHER: "Teacher",
  PARENT: "Parent",
  CLINIC_USER: "Clinic User",
  DSD_USER: "DSD Caseworker",
};

export const ROLE_HOME: Record<Role, string> = {
  SUPERADMIN: "/dashboard/superadmin",
  SCHOOLADMIN: "/dashboard/schooladmin",
  TEACHER: "/dashboard/teacher",
  PARENT: "/dashboard/parent",
  CLINIC_USER: "/dashboard/clinic",
  DSD_USER: "/dashboard/clinic",
};

/** POPIA: mask a contact number — keep country prefix + last 3 digits. */
export function maskCell(cell?: string | null): string {
  if (!cell) return "••••••••••";
  const digits = cell.replace(/\D/g, "");
  if (digits.length < 7) return "••••••••••";
  const prefix = digits.startsWith("27") ? "+27 " : "";
  const rest = prefix ? digits.slice(2) : digits;
  return `${prefix}${rest.slice(0, 2)}•••••${rest.slice(-3)}`;
}

/** POPIA: mask an address until manually overridden (logged). */
export function maskAddress(address?: string | null): string {
  if (!address) return "No address on file";
  const first = address.split(" ").slice(0, 1).join(" ");
  return `${first} •••• (masked — override unlocks for home visits)`;
}

export function formatZAR(cents: number): string {
  return `R${(cents / 100).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeUntil(iso?: string | null): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  const days = Math.ceil(diff / 86400000);
  if (days <= 0) return "Due now";
  return days === 1 ? "1 day left" : `${days} days left`;
}
