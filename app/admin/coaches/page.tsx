import Link from "next/link";
import { Star } from "lucide-react";

import { createClient } from "@/lib/supabase/server";

type CoachSpecialization = "yks_sayisal" | "yks_ea" | "yks_sozel" | "yks_ydt" | "lgs_ortaokul";

const SPECIALIZATION_LABELS: Record<CoachSpecialization, string> = {
  yks_sayisal: "YKS-Sayısal",
  yks_ea: "YKS-EA",
  yks_sozel: "YKS-Sözel",
  yks_ydt: "YKS-YDT",
  lgs_ortaokul: "LGS/Ortaokul",
};

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function formatRelativeTime(iso: string | null) {
  if (!iso) return "Hiç görülmedi";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dakika önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
}

async function fetchCoachDirectory() {
  const supabase = await createClient();

  const [{ data: coaches }, { data: coachProfiles }, { data: coachLinks }, { data: ratingRows }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("role", "coach").order("full_name").limit(200),
    supabase.from("coach_profiles").select("coach_id, specialization, max_students, last_active_at"),
    supabase.from("coach_students").select("coach_id"),
    // Pre-aggregated by coach_average_ratings (0049) -- Postgres computes
    // avg()/count() instead of this page reducing every rated session
    // platform-wide, forever, in JS.
    supabase.from("coach_average_ratings").select("coach_id, avg_rating, rating_count"),
  ]);

  const profileByCoach = new Map((coachProfiles ?? []).map((cp) => [cp.coach_id, cp]));

  const activeCountByCoach = new Map<string, number>();
  for (const l of coachLinks ?? []) {
    activeCountByCoach.set(l.coach_id, (activeCountByCoach.get(l.coach_id) ?? 0) + 1);
  }

  const ratingByCoach = new Map((ratingRows ?? []).map((r) => [r.coach_id, r]));

  return (coaches ?? []).map((c) => {
    const profile = profileByCoach.get(c.id);
    const rating = ratingByCoach.get(c.id);
    return {
      id: c.id,
      full_name: c.full_name,
      specialization: (profile?.specialization ?? null) as CoachSpecialization | null,
      activeCount: activeCountByCoach.get(c.id) ?? 0,
      maxStudents: profile?.max_students ?? 20,
      avgRating: rating ? Number(rating.avg_rating) : null,
      lastActiveAt: profile?.last_active_at ?? null,
      isOnline: profile?.last_active_at
        ? Date.now() - new Date(profile.last_active_at).getTime() < ONLINE_WINDOW_MS
        : false,
    };
  });
}

export default async function CoachDirectoryPage() {
  const coaches = await fetchCoachDirectory();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Koçlar</h1>
      </header>

      {coaches.length === 0 ? (
        <p className="text-muted-foreground text-sm">Henüz kayıtlı koç yok.</p>
      ) : (
        <div className="space-y-3">
          {coaches.map((coach) => (
            <Link
              key={coach.id}
              href={`/admin/coaches/${coach.id}`}
              className="border-border hover:bg-accent/40 flex items-center justify-between gap-3 rounded-lg border p-4 transition-colors"
            >
              <div>
                <p className="text-foreground text-sm font-medium">{coach.full_name ?? "(İsimsiz)"}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  {coach.specialization && (
                    <span className="bg-secondary text-secondary-foreground rounded px-1.5 py-0.5">
                      {SPECIALIZATION_LABELS[coach.specialization]}
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    Aktif: {coach.activeCount} / Kapasite: {coach.maxStudents}
                  </span>
                  <span className="flex items-center gap-0.5 text-amber-600">
                    <Star className="size-3 fill-current" />
                    {coach.avgRating !== null ? coach.avgRating.toFixed(1) : "—"}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-xs">
                <span
                  className={`size-2 rounded-full ${coach.isOnline ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
                />
                <span className="text-muted-foreground">
                  {coach.isOnline ? "Çevrimiçi" : `Son görülme: ${formatRelativeTime(coach.lastActiveAt)}`}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
