import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

// Request-level memoization of the two lookups EVERY server render used to repeat
// -- the logged-in user and their own profile row. Each call to auth.getUser() is
// a network round trip to Supabase Auth and each profiles read a database round
// trip; with a few hundred ms of latency each, asking for the same thing from the
// layout, the page and the helper functions in between added up to seconds.
//
// React's cache() scopes the result to ONE request/render pass: it can never
// leak across requests or users, so this is purely a latency fix, not a
// staleness or security change (same reasoning as getViewContext in
// lib/impersonation.ts, which now builds on these).

export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

// The logged-in user's OWN profile (role, active flag, name) -- one read per
// render, whoever asks (guard, layout greeting, ...).
export const getMyProfile = cache(async () => {
  const user = await getAuthUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("role, is_active, full_name").eq("id", user.id).maybeSingle();
  return data as { role: string | null; is_active: boolean | null; full_name: string | null } | null;
});
