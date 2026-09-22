"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isDateInChartRange, LAST_30_DAYS_RANGE, type ChartRange } from "@/lib/chart-range";
import { aggregateParagrafProblemByDate } from "@/lib/paragraf-problem-chart";
import { computeNet } from "@/lib/scoring";
import { ChartRangePicker } from "../_components/charts/chart-range-picker";
import { DualMetricChart } from "../_components/charts/dual-metric-chart";
import { getMoreParagrafEntries, getParagrafEntriesForDateRange, saveParagrafProblemEntry } from "./actions";
import { PARAGRAF_ENTRIES_PAGE_SIZE } from "./constants";

type SubjectForm = { dogru: string; yanlis: string; bos: string; sure: string };
type SubjectEntry = { dogru: number; yanlis: number; bos: number; sure: number; net: number };
export type HistoryEntry = {
  id: string;
  date: string;
  paragraf: SubjectEntry;
  problem: SubjectEntry;
};

const EMPTY_SUBJECT: SubjectForm = { dogru: "", yanlis: "", bos: "", sure: "" };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function ParagrafProblemClient({
  initialHistory,
  initialHasMore,
}: {
  initialHistory: HistoryEntry[];
  initialHasMore: boolean;
}) {
  const router = useRouter();
  const [date, setDate] = useState(todayISO());
  const [paragraf, setParagraf] = useState<SubjectForm>(EMPTY_SUBJECT);
  const [problem, setProblem] = useState<SubjectForm>(EMPTY_SUBJECT);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState(initialHistory);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncedHistory, setSyncedHistory] = useState(initialHistory);

  // Chart-only date range -- entirely separate from the "Geçmiş Veriler"
  // table's own pagination below, which keeps using `history`/`hasMore`
  // untouched. "Son 30 Gün" is answered from whatever's already loaded
  // (the initial fetch already covers the most recent 30 rows); a custom
  // calendar range may fall outside that window, so it's fetched on demand
  // and cached by its "start_end" key to avoid refetching on toggle-back.
  const [chartRange, setChartRange] = useState<ChartRange>(LAST_30_DAYS_RANGE);
  const [rangeCache, setRangeCache] = useState<Record<string, HistoryEntry[]>>({});
  const rangeCacheKey = chartRange.type === "custom" ? `${chartRange.startDate}_${chartRange.endDate}` : null;
  // Derived, not its own state -- true exactly while a selected range's
  // rows haven't landed in rangeCache yet, so it clears itself the instant
  // the fetch below resolves without a second setState call.
  const loadingChartRange = rangeCacheKey !== null && !rangeCache[rangeCacheKey];

  useEffect(() => {
    if (chartRange.type !== "custom" || rangeCacheKey === null || rangeCache[rangeCacheKey]) return;
    let cancelled = false;
    getParagrafEntriesForDateRange(chartRange.startDate, chartRange.endDate).then((rows) => {
      if (cancelled) return;
      setRangeCache((prev) => ({ ...prev, [rangeCacheKey]: rows }));
    });
    return () => {
      cancelled = true;
    };
  }, [chartRange, rangeCacheKey, rangeCache]);

  // router.refresh() after a save re-runs the server fetch (page 1 only)
  // and hands down a new initialHistory/initialHasMore -- resync local
  // state to it rather than keep whatever "load more" had accumulated.
  // Adjusted during render (not an effect) per React's "storing
  // information from previous renders" pattern -- avoids an extra
  // commit just to reset state that render can settle in one pass.
  if (initialHistory !== syncedHistory) {
    setSyncedHistory(initialHistory);
    setHistory(initialHistory);
    setHasMore(initialHasMore);
  }

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const more = await getMoreParagrafEntries(history.length);
      setHistory((prev) => [...prev, ...more]);
      setHasMore(more.length === PARAGRAF_ENTRIES_PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }

  const paragrafNet = computeNet(Number(paragraf.dogru) || 0, Number(paragraf.yanlis) || 0);
  const problemNet = computeNet(Number(problem.dogru) || 0, Number(problem.yanlis) || 0);

  async function handleSave() {
    setSaving(true);
    try {
      await saveParagrafProblemEntry({
        entryDate: date,
        paragraf: {
          dogru: Number(paragraf.dogru) || 0,
          yanlis: Number(paragraf.yanlis) || 0,
          bos: Number(paragraf.bos) || 0,
          sure: Number(paragraf.sure) || 0,
        },
        problem: {
          dogru: Number(problem.dogru) || 0,
          yanlis: Number(problem.yanlis) || 0,
          bos: Number(problem.bos) || 0,
          sure: Number(problem.sure) || 0,
        },
      });
      setParagraf(EMPTY_SUBJECT);
      setProblem(EMPTY_SUBJECT);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  // One point per DAY, not per row: a day can now hold several rows for the
  // same date -- a manual entry plus a Paragraf/Problem routine task the
  // student marked done, or more than one of either -- so the chart sums them
  // together first (aggregateParagrafProblemByDate) instead of plotting (or
  // drawing a line through) more than one point on the same date. The
  // "Geçmiş Veriler" table below stays one row per entry, exactly as logged.
  const chartSortedAsc = useMemo(() => {
    const source =
      chartRange.type === "last30"
        ? history.filter((e) => isDateInChartRange(e.date, chartRange))
        : (rangeCache[rangeCacheKey!] ?? []);
    return aggregateParagrafProblemByDate(source.map((e) => ({ date: e.date, paragraf: e.paragraf, problem: e.problem })));
  }, [chartRange, history, rangeCache, rangeCacheKey]);
  const sortedDesc = useMemo(
    () => [...history].sort((a, b) => b.date.localeCompare(a.date)),
    [history],
  );

  const paragrafSeries = chartSortedAsc.map((e) => ({
    date: e.date,
    a: computeNet(e.paragraf.dogru, e.paragraf.yanlis),
    b: e.paragraf.sure,
  }));
  const problemSeries = chartSortedAsc.map((e) => ({
    date: e.date,
    a: computeNet(e.problem.dogru, e.problem.yanlis),
    b: e.problem.sure,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">
          Paragraf ve Problem Takibi
        </h1>
        <p className="text-muted-foreground text-sm">
          Günlük paragraf ve problem çalışmalarını gir, gelişimini grafikte izle.
        </p>
      </header>

      {/* Görev panosundan bir Paragraf/Problem rutinini "Tamamlandı" ya da
          "Yarım" işaretlemek burayı otomatik günceller -- aynı çalışmayı iki
          kez girmeye gerek yok. Aşağıdaki form yalnızca görev panosunda
          karşılığı olmayan (ör. bağımsız, kendi başına yapılan) çalışmalar
          için. */}
      <div className="border-primary/20 bg-primary/5 text-foreground mb-6 rounded-lg border px-4 py-3 text-sm">
        Görev panondan bir Paragraf veya Problem rutinini tamamlandı olarak işaretlediğinde bu sayfa otomatik güncellenir. Aşağıdaki
        formu yalnızca görev panonda karşılığı olmayan ekstra çalışmalar için kullan.
      </div>

      <section aria-labelledby="section-charts">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="section-charts" className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Gelişim Grafikleri
          </h2>
          <ChartRangePicker value={chartRange} onChange={setChartRange} />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Paragraf Gelişimi</CardTitle>
              <CardDescription>Net ve süre değişimi</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingChartRange ? (
                <p className="text-muted-foreground flex h-[200px] items-center justify-center text-sm">
                  Yükleniyor...
                </p>
              ) : (
                <DualMetricChart data={paragrafSeries} labelA="Net" labelB="Süre" unitB=" dk" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Problem Gelişimi</CardTitle>
              <CardDescription>Net ve süre değişimi</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingChartRange ? (
                <p className="text-muted-foreground flex h-[200px] items-center justify-center text-sm">
                  Yükleniyor...
                </p>
              ) : (
                <DualMetricChart data={problemSeries} labelA="Net" labelB="Süre" unitB=" dk" />
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <hr className="border-border my-8" />

      <section aria-labelledby="section-entry">
        <h2 id="section-entry" className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
          Yeni Veri Girişi
        </h2>
        <div className="space-y-4">
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="entry-date">Tarih</Label>
            <Input
              id="entry-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Paragraf Girişi</CardTitle>
              </CardHeader>
              <CardContent>
                <SubjectFields title="Paragraf" value={paragraf} onChange={setParagraf} net={paragrafNet} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Problem Girişi</CardTitle>
              </CardHeader>
              <CardContent>
                <SubjectFields title="Problem" value={problem} onChange={setProblem} net={problemNet} />
              </CardContent>
            </Card>
          </div>

          <Button type="button" onClick={handleSave} disabled={saving}>
            <Save className="size-4" />
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </div>
      </section>

      <hr className="border-border my-8" />

      <section aria-labelledby="section-history">
        <h2 id="section-history" className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
          Geçmiş Veriler
        </h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Paragraf Geçmişi</CardTitle>
            </CardHeader>
            <CardContent>
              {sortedDesc.length === 0 ? (
                <p className="text-muted-foreground text-sm">Henüz veri girilmedi.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tarih</TableHead>
                      <TableHead>Net</TableHead>
                      <TableHead>Süre</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedDesc.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{new Date(entry.date).toLocaleDateString("tr-TR")}</TableCell>
                        <TableCell>{entry.paragraf.net}</TableCell>
                        <TableCell>{entry.paragraf.sure} dk</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Problem Geçmişi</CardTitle>
            </CardHeader>
            <CardContent>
              {sortedDesc.length === 0 ? (
                <p className="text-muted-foreground text-sm">Henüz veri girilmedi.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tarih</TableHead>
                      <TableHead>Net</TableHead>
                      <TableHead>Süre</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedDesc.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{new Date(entry.date).toLocaleDateString("tr-TR")}</TableCell>
                        <TableCell>{entry.problem.net}</TableCell>
                        <TableCell>{entry.problem.sure} dk</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {hasMore && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4 w-full"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Yükleniyor..." : "Daha Fazla Yükle"}
          </Button>
        )}
      </section>
    </div>
  );
}

function SubjectFields({
  title,
  value,
  onChange,
  net,
}: {
  title: string;
  value: SubjectForm;
  onChange: (value: SubjectForm) => void;
  net: number;
}) {
  function set(field: keyof SubjectForm, fieldValue: string) {
    onChange({ ...value, [field]: fieldValue });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <span className="text-muted-foreground text-xs">
          Net: <span className="text-foreground font-semibold">{net}</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${title}-dogru`}>Doğru</Label>
          <Input
            id={`${title}-dogru`}
            type="number"
            min={0}
            inputMode="numeric"
            value={value.dogru}
            onChange={(e) => set("dogru", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${title}-yanlis`}>Yanlış</Label>
          <Input
            id={`${title}-yanlis`}
            type="number"
            min={0}
            inputMode="numeric"
            value={value.yanlis}
            onChange={(e) => set("yanlis", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${title}-bos`}>Boş</Label>
          <Input
            id={`${title}-bos`}
            type="number"
            min={0}
            inputMode="numeric"
            value={value.bos}
            onChange={(e) => set("bos", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${title}-sure`}>Süre (dk)</Label>
          <Input
            id={`${title}-sure`}
            type="number"
            min={0}
            inputMode="numeric"
            value={value.sure}
            onChange={(e) => set("sure", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
