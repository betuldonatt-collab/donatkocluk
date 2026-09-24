"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PROFILE_TERMS, formatPercentile } from "@/lib/profile-terms";
import type { StudentProfile } from "../types";
import { EditProfileDialog } from "./edit-profile-dialog";

function formatDate(dateStr: string | null) {
  if (!dateStr) return "Henüz belirlenmedi";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

function YesNo({ value }: { value: boolean }) {
  return <span className={value ? "text-emerald-600" : "text-muted-foreground"}>{value ? "Evet" : "Hayır"}</span>;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground text-right font-medium">{value}</span>
    </div>
  );
}

// Coach-editable: the "Düzenle" button opens a form pre-filled with the
// student's academic profile (everything except the three admin-only
// "system info" fields -- see EditableProfileFields in actions.ts). Local
// state mirrors the KaynakTakibiTab pattern so the card reflects a save
// immediately without waiting on the page's server-side revalidation.
export function ProfileOverviewCard({
  studentId,
  profile: initialProfile,
  remainingSessions,
}: {
  studentId: string;
  profile: StudentProfile;
  remainingSessions: number;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [dialogOpen, setDialogOpen] = useState(false);
  const isLgs = profile.exam_type === "LGS";
  const terms = PROFILE_TERMS[isLgs ? "LGS" : "YKS"];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Kişisel &amp; Akademik Profil</CardTitle>
        <Button type="button" size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          <Pencil className="size-4" />
          Düzenle
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <section>
          <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">Sistem Bilgileri</p>
          <Field label="Koçluğa Başlama Tarihi" value={formatDate(profile.coaching_start_date)} />
          <Field label="Belirlenen Görüşme Günü" value={profile.assigned_meeting_day || "Henüz belirlenmedi"} />
          <Field label="Kalan Görüşme" value={remainingSessions} />
        </section>

        <section>
          <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">Kişisel Bilgiler</p>
          <Field label="Şehir" value={profile.city || "—"} />
          <Field label="İletişim" value={profile.phone || "—"} />
          <Field label="Veli Adı" value={profile.parent_name || "—"} />
          <Field label="Veli İletişim" value={profile.parent_phone || "—"} />
        </section>

        <section>
          <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">Akademik Hedefler</p>
          {isLgs ? (
            <>
              <Field label={terms.targetOne} value={profile.target_high_school || "—"} />
              <Field label={terms.targetTwo} value={formatPercentile(profile.target_percentile)} />
            </>
          ) : (
            <>
              <Field label={terms.targetOne} value={profile.target_university || "—"} />
              <Field label={terms.targetTwo} value={profile.target_department || "—"} />
              <Field label="Hedef Sıralama" value={profile.target_ranking || "—"} />
            </>
          )}
        </section>

        <section>
          <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">Akademik Durum</p>
          <Field label="Okul" value={profile.school_name || "—"} />
          <Field label="Sınıf/Şube" value={profile.sinif_sube || "—"} />
          <Field label={terms.grade} value={(isLgs ? profile.report_card_average : profile.obp) ?? "—"} />
          <Field label="Dershaneye Gidiyor mu?" value={<YesNo value={profile.attends_dershane} />} />
          <Field label="Deneme Kulübüne Gidiyor mu?" value={<YesNo value={profile.attends_deneme_kulubu} />} />
          <Field label="Özel Ders Alıyor mu?" value={<YesNo value={profile.has_private_tutor} />} />
          <Field label="Daha Önce Koçluk Almış mı?" value={<YesNo value={profile.had_previous_coaching} />} />
          {!isLgs && <Field label="Eski YKS Sıralaması / Notu" value={profile.previous_yks_ranking || "—"} />}
        </section>

        <section>
          <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">Ders Analizi</p>
          <div className="space-y-2 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Keyif Alınan Dersler</p>
              <p className="text-foreground">{profile.favorite_subjects || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Zorlanılan Dersler</p>
              <p className="text-foreground">{profile.difficult_subjects || "—"}</p>
            </div>
          </div>
        </section>
      </CardContent>

      <EditProfileDialog
        studentId={studentId}
        profile={profile}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={(updated) => setProfile((prev) => ({ ...prev, ...updated }))}
      />
    </Card>
  );
}
