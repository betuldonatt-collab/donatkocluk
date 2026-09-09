import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { PasswordForm } from "./_components/password-form";
import { StudentRadarForm } from "./_components/student-radar-form";
import { ThemeToggle } from "./_components/theme-toggle";

const DEFAULT_SETTINGS = {
  inactivity_threshold_days: 3,
  critical_completion_threshold_pct: 50,
  success_alert_enabled: true,
};

export default async function CoachSettingsPage() {
  const view = await getViewContext("coach");
  const supabase = await createClient();

  const { data: settingsRow } = view
    ? await supabase
        .from("coach_settings")
        .select("inactivity_threshold_days, critical_completion_threshold_pct, success_alert_enabled")
        .eq("coach_id", view.effectiveUserId)
        .maybeSingle()
    : { data: null };

  const settings = settingsRow ?? DEFAULT_SETTINGS;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Ayarlar</h1>
        <p className="text-muted-foreground text-sm">Sistem tercihlerini ve öğrenci uyarı eşiklerini yönet.</p>
      </header>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Görünüm</CardTitle>
            <CardDescription>Açık veya koyu temayı seç</CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeToggle />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Şifre Değiştir</CardTitle>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Öğrenci Radarı</CardTitle>
            <CardDescription>Bildirim eşiklerini kendine göre ayarla</CardDescription>
          </CardHeader>
          <CardContent>
            <StudentRadarForm
              inactivityThresholdDays={settings.inactivity_threshold_days}
              criticalCompletionThresholdPct={settings.critical_completion_threshold_pct}
              successAlertEnabled={settings.success_alert_enabled}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
