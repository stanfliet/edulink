import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_HOME, type Role } from "@/lib/utils";

/**
 * Role router — resolves the authenticated profile and redirects to
 * the correct role space. Every role lands on its own fluid view.
 */
export default async function DashboardRouter() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = (profile?.role ?? "PARENT") as Role;
  redirect(ROLE_HOME[role] ?? "/dashboard/parent");
}
