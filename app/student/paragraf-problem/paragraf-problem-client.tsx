"use client";

import { useMemo, useState } from "react";
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
import { computeNet } from "@/lib/scoring";
import { LineChart } from "./_components/line-chart";
import { saveParagrafProblemEntry } from "./actions";

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

export function ParagrafProblemClient({ initialHistory }: { initialHistory: HistoryEntry[] }) {
  const router = useRouter();
  const [date, setDate] = useState(todayISO());
  const [paragraf, setParagraf] = useState<SubjectForm>(EMPTY_SUBJECT);
  const [problem, setProblem] = useState<SubjectForm>(EMPTY_SUBJECT);
  const [saving, setSaving] = useState(false);
  const history = initialHistory;

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

  const sortedAsc = useMemo(
    () => [...history].sort((a, b) => a.date.localeCompare(b.date)),
    [history],
  );
  const sortedDesc = useMemo(
    () => [...history].sort((a, b) => b.date.localeCompare(a.date)),
    [history],
  );

  const paragrafNetSeries = sortedAsc.map((e) => ({ date: e.date, value: e.paragraf.net }));
  const paragrafSureSeries = sortedAsc.map((e) => ({ date: e.date, value: e.paragraf.sure }));
  const problemNetSeries = sortedAsc.map((e) => ({ date: e.date, value: e.problem.net }));
  const problemSureSeries = sortedAsc.map((e) => ({ date: e.date, value: e.problem.sure }));

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

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Yeni Veri Girişi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="entry-date">Tarih</Label>
            <Input
              id="entry-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <SubjectFields
              title="Paragraf"
              value={paragraf}
              onChange={setParagraf}
              net={paragrafNet}
            />
            <SubjectFields
              title="Problem"
              value={problem}
              onChange={setProblem}
              net={problemNet}
            />
          </div>

          <Button type="button" onClick={handleSave} disabled={saving}>
            <Save className="size-4" />
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </CardContent>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Paragraf Gelişimi</CardTitle>
            <CardDescription>Net ve süre değişimi</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-medium">Net</p>
              <LineChart data={paragrafNetSeries} />
            </div>
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-medium">Süre (dk)</p>
              <LineChart data={paragrafSureSeries} unit=" dk" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Problem Gelişimi</CardTitle>
            <CardDescription>Net ve süre değişimi</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-medium">Net</p>
              <LineChart data={problemNetSeries} />
            </div>
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-medium">Süre (dk)</p>
              <LineChart data={problemSureSeries} unit=" dk" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Geçmiş Veriler</CardTitle>
        </CardHeader>
        <CardContent>
          {sortedDesc.length === 0 ? (
            <p className="text-muted-foreground text-sm">Henüz veri girilmedi.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Paragraf Net</TableHead>
                  <TableHead>Paragraf Süre</TableHead>
                  <TableHead>Problem Net</TableHead>
                  <TableHead>Problem Süre</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDesc.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      {new Date(entry.date).toLocaleDateString("tr-TR")}
                    </TableCell>
                    <TableCell>{entry.paragraf.net}</TableCell>
                    <TableCell>{entry.paragraf.sure} dk</TableCell>
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
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
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
