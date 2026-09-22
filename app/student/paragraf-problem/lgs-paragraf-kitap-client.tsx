"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isDateInChartRange, LAST_30_DAYS_RANGE, type ChartRange } from "@/lib/chart-range";
import { computeLgsNet } from "@/lib/scoring";
import { ChartRangePicker } from "../_components/charts/chart-range-picker";
import { DualMetricChart } from "../_components/charts/dual-metric-chart";
import { LineChart } from "../_components/charts/line-chart";
import { getLgsEntriesForDateRange, getMoreLgsEntries, saveLgsKitap, saveLgsParagraf } from "./lgs-actions";
import { PARAGRAF_ENTRIES_PAGE_SIZE } from "./constants";
import type { LgsHistoryEntry } from "./lgs-types";

type ParagrafForm = { dogru: string; yanlis: string; bos: string; sure: string };
type KitapForm = { pages: string; title: string; author: string };

const EMPTY_PARAGRAF: ParagrafForm = { dogru: "", yanlis: "", bos: "", sure: "" };
const EMPTY_KITAP: KitapForm = { pages: "", title: "", author: "" };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("tr-TR");
}

// LGS version of the Paragraf ve Problem page: Paragraf is scored with LGS's
// 3-wrong-cancels-1-right net, Kitap Okuma logs pages read (with an optional
// book title / author), and there is no Problem section at all. Same layout
// as the YKS page: charts, then entry, then history.
export function LgsParagrafKitapClient({
  initialHistory,
  initialHasMore,
}: {
  initialHistory: LgsHistoryEntry[];
  initialHasMore: boolean;
}) {
  const router = useRouter();
  const [date, setDate] = useState(todayISO());
  const [paragraf, setParagraf] = useState<ParagrafForm>(EMPTY_PARAGRAF);
  const [kitap, setKitap] = useState<KitapForm>(EMPTY_KITAP);
  const [savingParagraf, setSavingParagraf] = useState(false);
  const [savingKitap, setSavingKitap] = useState(false);
  const [history, setHistory] = useState(initialHistory);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncedHistory, setSyncedHistory] = useState(initialHistory);

  // Same chart-range handling as the YKS page: "Son 30 Gün" is answered from
  // what's already loaded, a custom range is fetched on demand and cached.
  const [chartRange, setChartRange] = useState<ChartRange>(LAST_30_DAYS_RANGE);
  const [rangeCache, setRangeCache] = useState<Record<string, LgsHistoryEntry[]>>({});
  const rangeCacheKey = chartRange.type === "custom" ? `${chartRange.startDate}_${chartRange.endDate}` : null;
  const loadingChartRange = rangeCacheKey !== null && !rangeCache[rangeCacheKey];

  useEffect(() => {
    if (chartRange.type !== "custom" || rangeCacheKey === null || rangeCache[rangeCacheKey]) return;
    let cancelled = false;
    getLgsEntriesForDateRange(chartRange.startDate, chartRange.endDate)
      .then((rows) => {
        if (cancelled) return;
        setRangeCache((prev) => ({ ...prev, [rangeCacheKey]: rows }));
      })
      .catch(() => {
        if (cancelled) return;
        // Cache an empty range so the chart stops showing "Yükleniyor..."
        // forever, and say what happened.
        toast.error("Grafik verisi yüklenemedi, tekrar dene.");
        setRangeCache((prev) => ({ ...prev, [rangeCacheKey]: [] }));
      });
    return () => {
      cancelled = true;
    };
  }, [chartRange, rangeCacheKey, rangeCache]);

  // router.refresh() after a save hands down a fresh page 1 -- resync to it
  // during render (React's "storing information from previous renders").
  if (initialHistory !== syncedHistory) {
    setSyncedHistory(initialHistory);
    setHistory(initialHistory);
    setHasMore(initialHasMore);
    setRangeCache({});
  }

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const more = await getMoreLgsEntries(history.length);
      setHistory((prev) => [...prev, ...more]);
      setHasMore(more.length === PARAGRAF_ENTRIES_PAGE_SIZE);
    } catch {
      toast.error("Geçmiş veriler yüklenemedi, tekrar dene.");
    } finally {
      setLoadingMore(false);
    }
  }

  const paragrafNet = computeLgsNet(Number(paragraf.dogru) || 0, Number(paragraf.yanlis) || 0);
  const paragrafHasInput = [paragraf.dogru, paragraf.yanlis, paragraf.bos, paragraf.sure].some((v) => v !== "");

  async function handleSaveParagraf() {
    if (!paragrafHasInput) {
      toast.error("Önce paragraf sonuçlarını gir.");
      return;
    }
    setSavingParagraf(true);
    try {
      const res = await saveLgsParagraf({
        entryDate: date,
        dogru: Number(paragraf.dogru) || 0,
        yanlis: Number(paragraf.yanlis) || 0,
        bos: Number(paragraf.bos) || 0,
        sure: paragraf.sure === "" ? null : Number(paragraf.sure) || 0,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Paragraf kaydedildi.");
      setParagraf(EMPTY_PARAGRAF);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kaydedilemedi, tekrar dene.");
    } finally {
      setSavingParagraf(false);
    }
  }

  async function handleSaveKitap() {
    if (kitap.pages === "") {
      toast.error("Okuduğun sayfa sayısını gir.");
      return;
    }
    setSavingKitap(true);
    try {
      const res = await saveLgsKitap({
        entryDate: date,
        pages: Number(kitap.pages) || 0,
        title: kitap.title.trim() || null,
        author: kitap.author.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Kitap okuma kaydedildi.");
      setKitap(EMPTY_KITAP);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kaydedilemedi, tekrar dene.");
    } finally {
      setSavingKitap(false);
    }
  }

  const chartSourceAsc = useMemo(() => {
    const source =
      chartRange.type === "last30"
        ? history.filter((e) => isDateInChartRange(e.date, chartRange))
        : (rangeCache[rangeCacheKey!] ?? []);
    return [...source].sort((a, b) => a.date.localeCompare(b.date));
  }, [chartRange, history, rangeCache, rangeCacheKey]);
  const sortedDesc = useMemo(() => [...history].sort((a, b) => b.date.localeCompare(a.date)), [history]);

  const paragrafSeries = chartSourceAsc
    .filter((e) => e.paragraf)
    .map((e) => ({ date: e.date, a: e.paragraf!.net, b: e.paragraf!.sure ?? 0 }));
  const kitapSeries = chartSourceAsc.filter((e) => e.kitap).map((e) => ({ date: e.date, value: e.kitap!.pages }));
  const paragrafHistory = sortedDesc.filter((e) => e.paragraf);
  const kitapHistory = sortedDesc.filter((e) => e.kitap);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Paragraf / Kitap Okuma</h1>
        <p className="text-muted-foreground text-sm">
          Günlük paragraf çalışmanı ve okuduğun kitap sayfalarını gir, gelişimini grafikte izle.
        </p>
      </header>

      {/* Görev panosundan bir Paragraf/Kitap Okuma rutinini tamamlandı/yarım
          işaretlemek burayı otomatik günceller (migration 0092) -- aynı
          çalışmayı iki kez girmeye gerek yok. */}
      <div className="border-primary/20 bg-primary/5 text-foreground mb-6 rounded-lg border px-4 py-3 text-sm">
        Görev panondan bir Paragraf veya Kitap Okuma rutinini tamamlandı olarak işaretlediğinde bu sayfa otomatik güncellenir. Aşağıdaki
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
              <CardDescription>Net (3 yanlış 1 doğruyu götürür) ve süre değişimi</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingChartRange ? (
                <p className="text-muted-foreground flex h-[200px] items-center justify-center text-sm">Yükleniyor...</p>
              ) : (
                <DualMetricChart data={paragrafSeries} labelA="Net" labelB="Süre" unitB=" dk" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Kitap Okuma Gelişimi</CardTitle>
              <CardDescription>Günlük okunan sayfa sayısı</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingChartRange ? (
                <p className="text-muted-foreground flex h-[200px] items-center justify-center text-sm">Yükleniyor...</p>
              ) : (
                <LineChart data={kitapSeries} color="#f59e0b" unit=" sf" />
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
            <Input id="entry-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <p className="text-muted-foreground text-xs">
              Aynı güne tekrar giriş yaparsan o günün önceki kaydı güncellenir.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Paragraf Girişi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-end">
                  <span className="text-muted-foreground text-xs">
                    Net: <span className="text-foreground font-semibold">{paragrafNet}</span>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(
                    [
                      ["dogru", "Doğru"],
                      ["yanlis", "Yanlış"],
                      ["bos", "Boş"],
                      ["sure", "Süre (dk)"],
                    ] as const
                  ).map(([field, label]) => (
                    <div key={field} className="space-y-1.5">
                      <Label htmlFor={`paragraf-${field}`}>{label}</Label>
                      <Input
                        id={`paragraf-${field}`}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={paragraf[field]}
                        onChange={(e) => setParagraf((p) => ({ ...p, [field]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                <Button type="button" onClick={handleSaveParagraf} disabled={savingParagraf}>
                  <Save className="size-4" />
                  {savingParagraf ? "Kaydediliyor..." : "Paragrafı Kaydet"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Kitap Okuma Girişi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="kitap-pages">Okunan Sayfa</Label>
                    <Input
                      id="kitap-pages"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={kitap.pages}
                      onChange={(e) => setKitap((k) => ({ ...k, pages: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="kitap-title">Kitap Adı (isteğe bağlı)</Label>
                    <Input
                      id="kitap-title"
                      value={kitap.title}
                      maxLength={200}
                      onChange={(e) => setKitap((k) => ({ ...k, title: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="kitap-author">Yazar (isteğe bağlı)</Label>
                    <Input
                      id="kitap-author"
                      value={kitap.author}
                      maxLength={200}
                      onChange={(e) => setKitap((k) => ({ ...k, author: e.target.value }))}
                    />
                  </div>
                </div>
                <Button type="button" onClick={handleSaveKitap} disabled={savingKitap}>
                  <BookOpen className="size-4" />
                  {savingKitap ? "Kaydediliyor..." : "Okumayı Kaydet"}
                </Button>
              </CardContent>
            </Card>
          </div>
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
              {paragrafHistory.length === 0 ? (
                <p className="text-muted-foreground text-sm">Henüz veri girilmedi.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tarih</TableHead>
                      <TableHead>D / Y / B</TableHead>
                      <TableHead>Net</TableHead>
                      <TableHead>Süre</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paragrafHistory.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{formatDate(entry.date)}</TableCell>
                        <TableCell className="tabular-nums">
                          {entry.paragraf!.dogru} / {entry.paragraf!.yanlis} / {entry.paragraf!.bos}
                        </TableCell>
                        <TableCell>{entry.paragraf!.net}</TableCell>
                        <TableCell>{entry.paragraf!.sure !== null ? `${entry.paragraf!.sure} dk` : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Kitap Okuma Geçmişi</CardTitle>
            </CardHeader>
            <CardContent>
              {kitapHistory.length === 0 ? (
                <p className="text-muted-foreground text-sm">Henüz veri girilmedi.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tarih</TableHead>
                      <TableHead>Sayfa</TableHead>
                      <TableHead>Kitap</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kitapHistory.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{formatDate(entry.date)}</TableCell>
                        <TableCell>{entry.kitap!.pages}</TableCell>
                        <TableCell className="whitespace-normal">
                          {entry.kitap!.title ? (
                            <>
                              {entry.kitap!.title}
                              {entry.kitap!.author && (
                                <span className="text-muted-foreground"> — {entry.kitap!.author}</span>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </TableCell>
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
