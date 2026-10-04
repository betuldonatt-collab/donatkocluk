"use client";

import { useState } from "react";
import { BookX } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { friendlyError } from "@/lib/friendly-error";
import { decideCourseRemoval, type PendingCourseRemoval } from "../../school-exam-actions";

// Dashboard tile for "Ders Silme Talepleri": a student said they do not take one of their
// school courses (Yazılılar -> "Bu dersi almıyorum") and the course stays on their page
// until their coach approves. Same compact tile + review dialog shape as the focus-review
// and photo-approval tiles next to it.
export function PendingCourseRemovalsPanel({ requests: initial }: { requests: PendingCourseRemoval[] }) {
  const [requests, setRequests] = useState(initial);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const studentCount = new Set(requests.map((r) => r.studentId)).size;

  async function decide(request: PendingCourseRemoval, decision: "approve" | "reject") {
    setBusyId(request.courseId);
    try {
      const res = await decideCourseRemoval(request.courseId, decision);
      if (!res.ok) {
        toast.error(res.error);
        // "Already processed" -- it is gone either way; anything else leaves it listed.
        if (res.error.includes("zaten işlenmiş")) setRequests((prev) => prev.filter((r) => r.courseId !== request.courseId));
        return;
      }
      setRequests((prev) => prev.filter((r) => r.courseId !== request.courseId));
      toast.success(decision === "approve" ? "Ders öğrencinin listesinden kaldırıldı." : "Talep reddedildi.");
    } catch (e) {
      toast.error(friendlyError(e, "Karar kaydedilemedi, tekrar dene."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(true)}
        className="hover:bg-accent/20 cursor-pointer transition-colors"
      >
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <BookX className="text-muted-foreground size-4" />
          <CardTitle className="text-sm">Ders Silme Talepleri ({requests.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {requests.length === 0 ? (
            <p className="text-muted-foreground text-xs">Yok</p>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">
                {studentCount} öğrenci okul yazılı listesinden {requests.length} dersi silmek istiyor.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(true);
                }}
              >
                İncele
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ders Silme Talepleri</DialogTitle>
            <DialogDescription>
              Öğrenci bu dersi almadığını söylüyor. Onaylarsan ders yazılı listesinden kalkar; reddedersen yerinde kalır ve
              öğrenci yeniden isteyebilir.
            </DialogDescription>
          </DialogHeader>
          {requests.length === 0 ? (
            <p className="text-muted-foreground text-sm">Bekleyen talep yok.</p>
          ) : (
            <ul className="space-y-2">
              {requests.map((r) => (
                <li key={r.courseId} className="border-border flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.studentName ?? "İsimsiz Öğrenci"}</p>
                    <p className="text-muted-foreground truncate text-xs">{r.courseName}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={busyId === r.courseId} onClick={() => decide(r, "reject")}>
                      Reddet
                    </Button>
                    <Button type="button" size="sm" disabled={busyId === r.courseId} onClick={() => decide(r, "approve")}>
                      Onayla
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
