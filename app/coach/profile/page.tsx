import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { getUserEmail } from "@/lib/impersonation-actions";
import { ProfileForm } from "./_components/profile-form";
import type { CoachSpecialization } from "./actions";

export default async function CoachProfilePage() {
  const view = await getViewContext("coach");

  if (!view) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-muted-foreground text-sm">Oturum bulunamadı.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: profile }, { data: coachProfile }, email] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url").eq("id", view.effectiveUserId).single(),
    supabase
      .from("coach_profiles")
      .select(
        "bio, specialization, phone, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, university, city",
      )
      .eq("coach_id", view.effectiveUserId)
      .maybeSingle(),
    // While impersonating, the session's own auth.getUser() is still the
    // real admin -- their email would be wrong here, so the target's
    // email is looked up the same admin-only way the coach directory does.
    view.isImpersonating
      ? getUserEmail(view.effectiveUserId).catch(() => null)
      : supabase.auth.getUser().then((r) => r.data.user?.email ?? null),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Profil</h1>
        <p className="text-muted-foreground text-sm">Herkese açık bilgilerin ve sadece yöneticilerin görebildiği bilgilerin.</p>
      </header>

      <ProfileForm
        email={email ?? ""}
        fullName={profile?.full_name ?? ""}
        avatarUrl={profile?.avatar_url ?? ""}
        bio={coachProfile?.bio ?? ""}
        specialization={(coachProfile?.specialization ?? null) as CoachSpecialization | null}
        phone={coachProfile?.phone ?? ""}
        emergencyContactName={coachProfile?.emergency_contact_name ?? ""}
        emergencyContactPhone={coachProfile?.emergency_contact_phone ?? ""}
        emergencyContactRelationship={coachProfile?.emergency_contact_relationship ?? ""}
        university={coachProfile?.university ?? ""}
        city={coachProfile?.city ?? ""}
      />
    </div>
  );
}
