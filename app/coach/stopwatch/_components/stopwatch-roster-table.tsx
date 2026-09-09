"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { isLiveNow } from "@/lib/focus-live-status";
import { cn } from "@/lib/utils";
import {
  createStudentGroup,
  deleteStudentGroup,
  getCoachLiveFocusStatuses,
  getStopwatchCompetitionData,
  setStudentCompetitionGroup,
  setStudentCompetitionStatus,
  type CompetitionStatus,
  type StopwatchRosterRow,
  type StudentGroup,
} from "../../actions";
import { MonthPicker } from "./month-picker";

const LIVE_POLL_INTERVAL_MS = 20_000;
const CLOCK_TICK_MS = 5_000;
const UNGROUPED_FILTER = "ungrouped";
const ALL_FILTER = "all";

function formatMinutesLabel(minutes: number) {
  if (minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} dk`;
  if (rest === 0) return `${hours} sa`;
  return `${hours} sa ${rest} dk`;
}

function selectClassName() {
  return "border-input bg-background h-8 w-full min-w-0 rounded-md border px-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";
}

const MONTH_LABELS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export function StopwatchRosterTable({
  initialRoster,
  initialGroups,
  initialYear,
  initialMonth,
}: {
  initialRoster: StopwatchRosterRow[];
  initialGroups: StudentGroup[];
  initialYear: number;
  initialMonth: number;
}) {
  const [roster, setRoster] = useState(initialRoster);
  const [groups, setGroups] = useState(initialGroups);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [isPending, startTransition] = useTransition();

  // "Tümü" / a specific group id / "ungrouped" -- purely a client-side
  // view filter over the already-fetched roster, no refetch needed. Group
  // NAMES are coach-private (student_groups has no student-read RLS
  // policy at all) -- this whole table only ever renders for the coach.
  const [groupFilter, setGroupFilter] = useState<string>(ALL_FILTER);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  // "Anlık Çalışma Durumu" -- kept fresh independently of the month
  // picker's own (heavier) refetch above: a local clock tick re-judges
  // staleness against whatever heartbeat timestamps are already in
  // hand, and a separate, cheap poll refreshes those timestamps every
  // LIVE_POLL_INTERVAL_MS. This map is seeded once from the initial
  // roster and otherwise only ever updated by that poll -- a month
  // switch's own roster refetch doesn't touch it, since the live signal
  // itself doesn't depend on which month is selected, and the row
  // render below falls back to the roster's own value for any student
  // the poll hasn't covered yet.
  const [now, setNow] = useState(() => Date.now());
  const [heartbeats, setHeartbeats] = useState<Map<string, string | null>>(
    () => new Map(initialRoster.map((r) => [r.studentId, r.activeFocusHeartbeatAt])),
  );

  useEffect(() => {
    const tickId = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    const pollId = setInterval(async () => {
      const statuses = await getCoachLiveFocusStatuses();
      setHeartbeats(new Map(statuses.map((s) => [s.studentId, s.activeFocusHeartbeatAt])));
    }, LIVE_POLL_INTERVAL_MS);
    return () => {
      clearInterval(tickId);
      clearInterval(pollId);
    };
  }, []);

  function handleMonthChange(nextYear: number, nextMonth: number) {
    setYear(nextYear);
    setMonth(nextMonth);
    startTransition(async () => {
      const data = await getStopwatchCompetitionData(nextYear, nextMonth);
      setRoster(data);
    });
  }

  async function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    setCreatingGroup(true);
    try {
      const created = await createStudentGroup(name);
      setGroups((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "tr")));
      setNewGroupName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Grup oluşturulamadı.");
    } finally {
      setCreatingGroup(false);
    }
  }

  async function handleDeleteGroup(group: StudentGroup) {
    if (!confirm(`"${group.name}" grubunu silmek istediğine emin misin? Bu gruptaki öğrenciler grupsuz kalır.`)) return;
    const previousGroups = groups;
    const previousRoster = roster;
    setGroups((prev) => prev.filter((g) => g.id !== group.id));
    setRoster((prev) =>
      prev.map((r) => (r.competitionGroupId === group.id ? { ...r, competitionGroupId: null, competitionGroupName: null } : r)),
    );
    if (groupFilter === group.id) setGroupFilter(ALL_FILTER);
    try {
      await deleteStudentGroup(group.id);
    } catch (e) {
      setGroups(previousGroups);
      setRoster(previousRoster);
      toast.error(e instanceof Error ? e.message : "Grup silinemedi, geri getirildi.");
    }
  }

  function handleGroupAssign(studentId: string, groupId: string) {
    const nextGroupId = groupId === "" ? null : groupId;
    const nextGroupName = nextGroupId ? (groups.find((g) => g.id === nextGroupId)?.name ?? null) : null;
    const previousRoster = roster;
    setRoster((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, competitionGroupId: nextGroupId, competitionGroupName: nextGroupName } : r)),
    );
    setStudentCompetitionGroup(studentId, nextGroupId).catch((e) => {
      setRoster(previousRoster);
      toast.error(e instanceof Error ? e.message : "Grup ataması kaydedilemedi, geri alındı.");
    });
  }

  function handleStatusToggle(studentId: string, current: CompetitionStatus) {
    const next: CompetitionStatus = current === "active" ? "passive" : "active";
    const previousRoster = roster;
    setRoster((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, competitionStatus: next } : r)));
    setStudentCompetitionStatus(studentId, next).catch((e) => {
      setRoster(previousRoster);
      toast.error(e instanceof Error ? e.message : "Durum güncellenemedi, geri alındı.");
    });
  }

  const visibleRoster = useMemo(() => {
    if (groupFilter === ALL_FILTER) return roster;
    if (groupFilter === UNGROUPED_FILTER) return roster.filter((r) => r.competitionGroupId === null);
    return roster.filter((r) => r.competitionGroupId === groupFilter);
  }, [roster, groupFilter]);

  // The trophy always goes to whoever is actually #1 among students the
  // coach hasn't excluded -- a passive student may well have the most
  // minutes (that's often exactly why they were flagged), but they don't
  // get the crown, matching how they're excluded from the student-facing
  // ranking too (get_daily_stopwatch_ranking). Computed within whatever
  // group tab is currently visible, so switching tabs re-crowns per group.
  const trophyStudentId = visibleRoster.find((r) => r.competitionStatus === "active" && r.monthlyMinutes > 0)?.studentId ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker year={year} month={month} onChange={handleMonthChange} />
        {isPending && <span className="text-muted-foreground text-xs">Yükleniyor...</span>}
      </div>

      {/* Group management + filter -- coach-private, never shown to a
          student. "Tümü" and "Grupsuz" are always-present pseudo-tabs;
          the rest are the coach's own custom groups. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setGroupFilter(ALL_FILTER)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            groupFilter === ALL_FILTER ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          Tümü
        </button>
        <button
          type="button"
          onClick={() => setGroupFilter(UNGROUPED_FILTER)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            groupFilter === UNGROUPED_FILTER ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          Grupsuz
        </button>
        {groups.map((group) => (
          <div key={group.id} className="group relative">
            <button
              type="button"
              onClick={() => setGroupFilter(group.id)}
              className={cn(
                "rounded-full border py-1.5 pr-6 pl-3 text-xs font-medium transition-colors",
                groupFilter === group.id ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {group.name}
            </button>
            <button
              type="button"
              onClick={() => handleDeleteGroup(group)}
              aria-label={`${group.name} grubunu sil`}
              className={cn(
                "absolute top-1/2 right-1.5 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100",
                groupFilter === group.id ? "text-primary-foreground/80 hover:text-primary-foreground" : "text-muted-foreground hover:text-destructive",
              )}
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <Input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
            placeholder="Yeni grup (Mezunlar, 12. Sınıflar...)"
            className="h-8 w-48 text-xs"
          />
          <Button type="button" size="icon" variant="outline" className="size-8" onClick={handleCreateGroup} disabled={creatingGroup || !newGroupName.trim()}>
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {visibleRoster.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              {roster.length === 0 ? "Henüz atanmış öğrencin yok." : "Bu grupta öğrenci yok."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-border text-muted-foreground border-b text-left text-xs font-semibold tracking-wide uppercase">
                    <th className="px-4 py-3">Öğrenci</th>
                    <th className="px-4 py-3">Sınıf/Şube</th>
                    <th className="px-4 py-3">Grup</th>
                    <th className="px-4 py-3">Durum</th>
                    <th className="px-4 py-3">Yarışma</th>
                    <th className="px-4 py-3 text-right">Günlük</th>
                    <th className="px-4 py-3 text-right">Haftalık</th>
                    <th className="px-4 py-3 text-right">{MONTH_LABELS[month - 1]} Toplamı</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRoster.map((row) => {
                    // Map.get returns undefined (not null) for a key
                    // the poll hasn't covered yet -- `??` alone would
                    // wrongly keep an old non-null roster timestamp
                    // forever once the poll confirms null (session
                    // ended), since `null ?? x` evaluates to `x`.
                    const heartbeatAt = heartbeats.has(row.studentId) ? (heartbeats.get(row.studentId) ?? null) : row.activeFocusHeartbeatAt;
                    const live = isLiveNow(heartbeatAt, now);
                    const isPassive = row.competitionStatus === "passive";
                    return (
                      <tr key={row.studentId} className={cn("border-border/60 border-b last:border-0", isPassive && "opacity-60")}>
                        <td className="text-foreground px-4 py-3 font-medium">
                          {row.studentId === trophyStudentId && <span className="mr-1.5">🏆</span>}
                          {row.fullName ?? "—"}
                        </td>
                        <td className="text-muted-foreground px-4 py-3">{row.sinifSube || "—"}</td>
                        <td className="px-4 py-3">
                          <select
                            className={selectClassName()}
                            value={row.competitionGroupId ?? ""}
                            onChange={(e) => handleGroupAssign(row.studentId, e.target.value)}
                          >
                            <option value="">Grupsuz</option>
                            {groups.map((group) => (
                              <option key={group.id} value={group.id}>
                                {group.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", live ? "text-emerald-600" : "text-muted-foreground")}>
                            <span className={cn("size-2 rounded-full", live ? "bg-emerald-500" : "bg-muted-foreground/30")} aria-hidden />
                            {live ? "Çalışıyor" : "Boşta"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleStatusToggle(row.studentId, row.competitionStatus)}
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                              isPassive
                                ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                                : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
                            )}
                            title={isPassive ? "Yarışmaya dahil etmek için tıkla" : "Yarışmadan çıkarmak için tıkla"}
                          >
                            {isPassive ? "Pasif" : "Aktif"}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatMinutesLabel(row.dailyMinutes)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatMinutesLabel(row.weeklyMinutes)}</td>
                        <td className="text-foreground px-4 py-3 text-right font-semibold tabular-nums">
                          {formatMinutesLabel(row.monthlyMinutes)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
