import { redirect } from "next/navigation";
import { NotebookPen } from "lucide-react";

import { getViewContext } from "@/lib/impersonation";
import { fetchIsGraduate } from "@/lib/graduate";
import { canAccessYazililar } from "@/lib/student-nav";
import { createClient } from "@/lib/supabase/server";

// Yazılılar -- the school-exam tracker. The tables and logic come in the next steps;
// for now this is the page the menu item points at.
export default async function YazililarPage() {
  const view = await getViewContext("student");
  const supabase = await createClient();
  // Graduates (Mezun) take no school exams: the menu item is hidden for them, and the
  // page is closed too, so typing the address does not get them in.
  if (view && !canAccessYazililar({ isGraduate: await fetchIsGraduate(supabase, view.effectiveUserId) })) {
    redirect("/student");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex items-center gap-3">
        <NotebookPen className="text-muted-foreground size-6" />
        <div>
          <h1 className="text-foreground text-2xl font-semibold">Yazılılar</h1>
          <p className="text-muted-foreground text-sm">Okul yazılılarını ve notlarını buradan takip edeceksin.</p>
        </div>
      </header>
      <p className="text-muted-foreground text-sm">Bu bölüm çok yakında burada olacak.</p>
    </div>
  );
}
