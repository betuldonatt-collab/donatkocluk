import { createClient } from "@/lib/supabase/server";
import { getViewContext } from "@/lib/impersonation";
import { weekDates } from "@/lib/date";
import type { StudentTask } from "../_components/daily-tasks/types";
import { SettingsClient } from "./settings-client";

const DAY_LABELS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const MONTH_LABELS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getWeekDays(todayIso: string) {
  return weekDates(todayIso).map((date, i) => {
    const d = new Date(`${date}T00:00:00Z`);
    return { date, label: `${DAY_LABELS[i]} ${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]}` };
  });
}

async function fetchSettingsData(userId: string) {
  const supabase = await createClient();
  const weekDays = getWeekDays(todayISO());
  const weekStart = weekDays[0].date;
  const weekEnd = weekDays[6].date;

  const [{ data: weekTaskRows }, { data: cancellationRows }] = await Promise.all([
    supabase
      .from("student_tasks")
      .select("*")
      .eq("student_id", userId)
      .gte("task_date", weekStart)
      .lte("task_date", weekEnd)
      .order("created_at", { ascending: true }),
    supabase
      .from("account_cancellation_requests")
      .select("id, created_at")
      .eq("student_id", userId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  return {
    weekDays,
    weekTasks: (weekTaskRows ?? []) as StudentTask[],
    existingRequest: cancellationRows?.[0] ?? null,
  };
}

export default async function SettingsPage() {
  const view = await getViewContext("student");

  const { weekDays, weekTasks, existingRequest } = view
    ? await fetchSettingsData(view.effectiveUserId)
    : { weekDays: getWeekDays(todayISO()), weekTasks: [] as StudentTask[], existingRequest: null };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 print:hidden">
        <h1 className="text-2xl font-semibold text-foreground">Ayarlar</h1>
      </header>

      <SettingsClient weekDays={weekDays} weekTasks={weekTasks} initialRequestedAt={existingRequest?.created_at ?? null} />
    </div>
  );
}
