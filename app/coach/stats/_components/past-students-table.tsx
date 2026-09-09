import { Users } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EXIT_CATEGORY_LABELS } from "@/lib/exit-category";
import type { PastStudent } from "../types";

export function PastStudentsTable({ students }: { students: PastStudent[] }) {
  return (
    <div>
      <h2 className="text-foreground mb-3 text-base font-semibold">Geçmiş Öğrenciler Listesi</h2>

      {students.length === 0 ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Users className="size-4" />
          Henüz ayrılan bir öğrencin yok.
        </p>
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad Soyad</TableHead>
                <TableHead>Kalma Süresi</TableHead>
                <TableHead>Tamamlanan Görüşme</TableHead>
                <TableHead>Ayrılış Nedeni</TableHead>
                <TableHead>Not</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.full_name ?? "İsimsiz Öğrenci"}</TableCell>
                  <TableCell className="tabular-nums">{s.stayMonths} ay</TableCell>
                  <TableCell className="tabular-nums">{s.completedSessions}</TableCell>
                  <TableCell>{s.exitCategory ? EXIT_CATEGORY_LABELS[s.exitCategory] : "Belirtilmedi"}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{s.exitNote || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
