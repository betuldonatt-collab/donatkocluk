import { formatLoginName } from "@/lib/phone";
import { getAuthUser } from "@/lib/supabase/session";

// The logged-in person's login name (the number they sign in with), for the
// read-only "Kullanıcı Adı" field on the settings pages. Uses the request-level
// cached auth user, so it costs no extra network call.
export async function getLoginName(): Promise<string | null> {
  const user = await getAuthUser();
  return formatLoginName(user?.phone);
}
