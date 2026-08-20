import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NextSessionCard } from "./_components/next-session-card";
import { CoachNotesPreview } from "./_components/coach-notes-preview";

async function fetchHomeData(userId: string) {
  const supabase = await createClient();
  // Grace window so a session that just started still shows as "next"
  // instead of disappearing the moment its scheduled time passes.
  const graceCutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const [{ data: sessionRows }, { data: noteRows }] = await Promise.all([
    supabase
      .from("coaching_sessions")
      .select("scheduled_at, meeting_url")
      .eq("student_id", userId)
      .gte("scheduled_at", graceCutoff)
      .order("scheduled_at", { ascending: true })
      .limit(1),
    supabase
      .from("coach_notes")
      .select("id, content, created_at")
      .eq("student_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  return {
    nextSession: sessionRows?.[0] ?? null,
    notes: noteRows ?? [],
  };
}

export default async function StudentHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { nextSession, notes } = user
    ? await fetchHomeData(user.id)
    : { nextSession: null, notes: [] };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Ana Sayfa</h1>
        <p className="text-muted-foreground text-sm">Tekrar hoş geldin!</p>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <NextSessionCard
          scheduledAt={nextSession?.scheduled_at ?? null}
          meetingUrl={nextSession?.meeting_url ?? null}
        />
        <CoachNotesPreview
          notes={notes.map((n) => ({ id: n.id, body: n.content, createdAt: n.created_at }))}
        />
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <ClipboardList className="text-primary size-6" />
          <CardTitle className="text-base">Bugünün ödevleri seni bekliyor</CardTitle>
          <CardDescription>
            Günlük ve haftalık görevlerini görmek, işaretlemek ve kronometre
            fotoğrafını yüklemek için Ödevler sayfasına geç.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/student/odevler">Ödevlere Git</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
