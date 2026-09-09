import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { ProfileClient, type ProfileData } from "./profile-client";

export default async function ProfilePage() {
  const view = await getViewContext("student");
  const supabase = await createClient();

  const { data: profile } = view
    ? await supabase.from("profiles").select("*").eq("id", view.effectiveUserId).single()
    : { data: null };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Profilim</h1>
        <p className="text-muted-foreground text-sm">
          Kişisel bilgilerini ve akademik hedeflerini güncel tut.
        </p>
      </header>

      <ProfileClient initialProfile={profile as ProfileData} />
    </div>
  );
}
