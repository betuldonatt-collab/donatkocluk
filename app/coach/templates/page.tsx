import { requireViewContext } from "@/lib/impersonation";
import { getWeeklyTemplates } from "../actions";
import { TemplatesClient } from "./_components/templates-client";

export default async function CoachTemplatesPage() {
  await requireViewContext("coach");
  const templates = await getWeeklyTemplates();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Haftalık Şablonlar</h1>
        <p className="text-muted-foreground text-sm">
          Tekrar eden haftalık programını bir kez kur, öğrencinin sayfasındaki &quot;Şablon Uygula&quot; ile tek tıkla haftasına ekle.
        </p>
      </header>

      <TemplatesClient initialTemplates={templates} />
    </div>
  );
}
