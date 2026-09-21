import { ClipboardList } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LGS_EXAM_SUBJECTS } from "@/lib/curriculum/subject-groups";
import { formatNet, type LgsHistoryExam } from "@/lib/lgs-exam";

// "LGS Deneme Geçmişi": every finished LGS mock exam with its per-subject nets,
// Sözel / Sayısal / Toplam net and the approximate puan. Rendered for LGS
// students only (the callers gate on exam_type) on the coach's student page and
// the student's own profile.

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

// Short column heads -- the full names are in the cell tooltips.
const SHORT_LABELS: Record<string, string> = {
  lgs_turkce: "Türkçe",
  lgs_inkilap: "İnkılap",
  lgs_din: "Din",
  lgs_ingilizce: "İng.",
  lgs_matematik: "Mat.",
  lgs_fen: "Fen",
};

export function LgsExamHistory({ exams }: { exams: LgsHistoryExam[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-baseline justify-between gap-3">
        <CardTitle className="text-base">LGS Deneme Geçmişi</CardTitle>
        {exams.length > 0 && <p className="text-muted-foreground text-xs">{exams.length} deneme · puanlar yaklaşıktır</p>}
      </CardHeader>
      <CardContent>
        {exams.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Henüz sonucu girilmiş LGS denemesi yok"
            description="Bir LGS Genel Deneme görevinin sonuçları girildiğinde burada netleri ve yaklaşık puanıyla görünür."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="py-2 pr-3 font-medium">Deneme</th>
                  {LGS_EXAM_SUBJECTS.map((s) => (
                    <th key={s.key} className="px-2 py-2 text-right font-medium" title={`${s.label} (${s.questions} soru)`}>
                      {SHORT_LABELS[s.key] ?? s.label}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right font-medium">Sözel</th>
                  <th className="px-2 py-2 text-right font-medium">Sayısal</th>
                  <th className="px-2 py-2 text-right font-medium">Toplam Net</th>
                  <th className="py-2 pl-2 text-right font-medium">Yaklaşık Puan</th>
                </tr>
              </thead>
              <tbody>
                {exams.map((exam) => (
                  <tr key={exam.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-3">
                      <p className="text-foreground font-medium">{exam.title}</p>
                      <p className="text-muted-foreground text-xs">{formatDate(exam.task_date)}</p>
                    </td>
                    {exam.summary.subjects.map((s) => (
                      <td
                        key={s.key}
                        className="px-2 py-2.5 text-right tabular-nums"
                        title={`${s.label}: ${s.correct} doğru, ${s.wrong} yanlış, ${s.empty} boş`}
                      >
                        {formatNet(s.net)}
                      </td>
                    ))}
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatNet(exam.summary.sozelNet)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatNet(exam.summary.sayisalNet)}</td>
                    <td className="text-foreground px-2 py-2.5 text-right font-semibold tabular-nums">{formatNet(exam.summary.totalNet)}</td>
                    <td className="text-foreground py-2.5 pl-2 text-right font-bold tabular-nums">
                      {exam.summary.approxScore.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
