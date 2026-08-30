"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/utils";

export interface Profile {
  user_id: string;
  school_id: string | null;
  role: Role;
  full_name: string;
  cell_number: string;
  email: string;
  district_zone: string;
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("unauthenticated");
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("users")
        .select("user_id, school_id, role, full_name, cell_number, email, district_zone")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error || !data) {
        setError(error?.message ?? "profile not found");
      } else {
        setProfile(data as Profile);
      }
      setLoading(false);
    })();
  }, []);

  return { profile, loading, error };
}
