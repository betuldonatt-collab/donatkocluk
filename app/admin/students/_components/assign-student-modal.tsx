"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { assignStudentFromPool, updateAcademicTrack, updateAdminNotes, updateMaarif9Flag } from "../../actions";
import { ResetPasswordButton } from "../../_components/reset-password-button";
import { SendToPoolButton } from "../../_components/send-to-pool-button";

type Person = { id: string; full_name: string | null };
type PoolStudent = Person & { admin_notes: string | null; academic_track: string | null; is_maarif9?: boolean };
type PoolCoach = Person & { activeCount: number; maxStudents: number };

const TRACK_OPTIONS: { value: string; label: string }[] = [
  { value: "yks_sayisal", label: "YKS-Sayısal" },
  { value: "yks_ea", label: "YKS-EA" },
  { value: "yks_sozel", label: "YKS-Sözel" },
  { value: "yks_ydt", label: "YKS-YDT" },
  { value: "lgs_ortaokul", label: "LGS/Ortaokul" },
];

const selectClass =
  "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-10 md:h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:opacity-50";

function AdminNotesField({ studentId, initialNotes }: { studentId: string; initialNotes: string | null }) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await updateAdminNotes(studentId, notes);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-foreground text-sm font-medium">Yönetici Notu (özel)</label>
      <Textarea
        rows={3}
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setSaved(false);
        }}
        placeholder="Örn: Başka kursa geçti, aramayın."
      />
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Kaydediliyor..." : "Notu Kaydet"}
        </Button>
        {saved && <span className="text-muted-foreground text-xs">Kaydedildi.</span>}
      </div>
    </div>
  );
}

// 9. Sınıf (Maarif) flag -- switches the student's panel and the coach's forms to the
// 9th-grade curriculum (no YKS countdown / TYT-AYT tabs).
function Maarif9Field({ studentId, initial }: { studentId: string; initial: boolean }) {
  const [checked, setChecked] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: boolean) {
    const previous = checked;
    setChecked(next);
    setSaving(true);
    setError(null);
    try {
      await updateMaarif9Flag(studentId, next);
    } catch {
      setChecked(previous);
      setError("Kaydedilemedi. Migration 0096 uygulandı mı?");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-foreground flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={checked} disabled={saving} onChange={(e) => handleChange(e.target.checked)} className="size-4" />
        9. Sınıf (Maarif) öğrencisi
      </label>
      <p className="text-muted-foreground text-xs">İşaretlenince öğrenci ve koç 9. sınıf müfredatını görür; YKS geri sayımı ve TYT/AYT sekmeleri gizlenir.</p>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

function AcademicTrackField({ studentId, initialTrack }: { studentId: string; initialTrack: string | null }) {
  const [track, setTrack] = useState(initialTrack ?? "");
  const [saving, setSaving] = useState(false);

  async function handleChange(value: string) {
    setTrack(value);
    setSaving(true);
    try {
      await updateAcademicTrack(studentId, value || null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-foreground text-sm font-medium">Akademik Alan</label>
      <select value={track} onChange={(e) => handleChange(e.target.value)} disabled={saving} className={selectClass}>
        <option value="">Belirtilmedi</option>
        {TRACK_OPTIONS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AssignStudentModal({
  student,
  coaches,
  parents,
  assignedCoachName,
}: {
  student: PoolStudent;
  coaches: PoolCoach[];
  parents: Person[];
  assignedCoachName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [coachId, setCoachId] = useState("");
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAssign() {
    if (!coachId) return;
    setSaving(true);
    setError(null);
    try {
      await assignStudentFromPool(student.id, coachId, parentId || null);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {assignedCoachName ? "Detay" : "Ata"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{student.full_name ?? "(İsimsiz)"} -- Öğrenci Detayı</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Prominent and immediately visible -- an admin resetting a
              locked-out student's password shouldn't have to scroll past
              the assignment form first. */}
          <ResetPasswordButton userId={student.id} />

          <AcademicTrackField studentId={student.id} initialTrack={student.academic_track} />
          <Maarif9Field studentId={student.id} initial={student.is_maarif9 === true} />
          <AdminNotesField studentId={student.id} initialNotes={student.admin_notes} />

          <div className="border-border space-y-4 border-t pt-4">
            {assignedCoachName ? (
              <div className="space-y-2">
                <p className="text-foreground text-sm font-medium">Koç Durumu</p>
                <p className="text-muted-foreground text-sm">
                  Şu an <span className="text-foreground font-medium">{assignedCoachName}</span> tarafından koçluk alıyor.
                </p>
                <SendToPoolButton studentId={student.id} />
              </div>
            ) : (
              <>
                <p className="text-foreground text-sm font-medium">Koça Ata</p>
                <div className="space-y-1.5">
                  <label className="text-foreground text-sm font-medium">Koç</label>
                  <select value={coachId} onChange={(e) => setCoachId(e.target.value)} className={selectClass}>
                    <option value="">Koç seç...</option>
                    {coaches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name ?? "(İsimsiz)"} — Aktif: {c.activeCount}/{c.maxStudents} Öğrenci
                      </option>
                    ))}
                  </select>
                  {coaches.length === 0 && (
                    <p className="text-muted-foreground text-xs">Kapasitesi uygun koç bulunamadı.</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-foreground text-sm font-medium">Veli (opsiyonel)</label>
                  <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={selectClass}>
                    <option value="">Veli seçme</option>
                    {parents.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name ?? "(İsimsiz)"}
                      </option>
                    ))}
                  </select>
                </div>

                {error && <p className="text-destructive text-sm">{error}</p>}
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Kapat
          </Button>
          {!assignedCoachName && (
            <Button type="button" onClick={handleAssign} disabled={!coachId || saving}>
              {saving ? "Atanıyor..." : "Ata"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
