"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PROFILE_TERMS } from "@/lib/profile-terms";
import { type EditableProfileFields, updateStudentProfile } from "../../../actions";
import type { StudentProfile } from "../types";

function toFormValue(profile: StudentProfile): EditableProfileFields {
  return {
    city: profile.city,
    phone: profile.phone,
    parent_name: profile.parent_name,
    parent_phone: profile.parent_phone,
    target_university: profile.target_university,
    target_department: profile.target_department,
    target_ranking: profile.target_ranking,
    // LGS-only columns are sent only for LGS students.
    ...(profile.exam_type === "LGS"
      ? {
          target_high_school: profile.target_high_school,
          target_percentile: profile.target_percentile,
          report_card_average: profile.report_card_average,
        }
      : {}),
    school_name: profile.school_name,
    sinif_sube: profile.sinif_sube,
    obp: profile.obp,
    attends_dershane: profile.attends_dershane,
    attends_deneme_kulubu: profile.attends_deneme_kulubu,
    has_private_tutor: profile.has_private_tutor,
    had_previous_coaching: profile.had_previous_coaching,
    previous_yks_ranking: profile.previous_yks_ranking,
    favorite_subjects: profile.favorite_subjects,
    difficult_subjects: profile.difficult_subjects,
  };
}

function TextField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} />
    </div>
  );
}

function SwitchField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// Coach-only edit surface for the "Kişisel & Akademik Profil" card.
// coaching_start_date / assigned_meeting_day / remaining_sessions are
// intentionally absent -- they're admin-only "system info" fields,
// enforced server-side by a trigger regardless of what this form sends
// (see updateStudentProfile in actions.ts).
export function EditProfileDialog({
  studentId,
  profile,
  open,
  onOpenChange,
  onSaved,
}: {
  studentId: string;
  profile: StudentProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (updated: EditableProfileFields) => void;
}) {
  const formId = useId();
  const isLgs = profile.exam_type === "LGS";
  const terms = PROFILE_TERMS[isLgs ? "LGS" : "YKS"];
  const [value, setValue] = useState<EditableProfileFields>(() => toFormValue(profile));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(patch: Partial<EditableProfileFields>) {
    setValue((v) => ({ ...v, ...patch }));
  }

  function handleOpenChange(next: boolean) {
    if (next) setValue(toFormValue(profile));
    onOpenChange(next);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateStudentProfile(studentId, value);
      onSaved(updated as EditableProfileFields);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Profili Düzenle</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Kişisel Bilgiler</p>
            <TextField id={`${formId}-city`} label="Şehir" value={value.city} onChange={(v) => set({ city: v })} />
            <TextField id={`${formId}-phone`} label="İletişim" value={value.phone} onChange={(v) => set({ phone: v })} />
            <TextField
              id={`${formId}-parent-name`}
              label="Veli Adı"
              value={value.parent_name}
              onChange={(v) => set({ parent_name: v })}
            />
            <TextField
              id={`${formId}-parent-phone`}
              label="Veli İletişim"
              value={value.parent_phone}
              onChange={(v) => set({ parent_phone: v })}
            />
          </section>

          <section className="space-y-3">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Akademik Hedefler</p>
            {isLgs ? (
              <>
                <TextField
                  id={`${formId}-target-high-school`}
                  label={terms.targetOne}
                  value={value.target_high_school ?? null}
                  onChange={(v) => set({ target_high_school: v })}
                />
                <div className="space-y-1.5">
                  <Label htmlFor={`${formId}-target-percentile`}>{terms.targetTwo}</Label>
                  <Input
                    id={`${formId}-target-percentile`}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    placeholder="Örn: 1.5 (ilk %1,5)"
                    value={value.target_percentile ?? ""}
                    onChange={(e) => set({ target_percentile: e.target.value.trim() ? Number(e.target.value) : null })}
                    className="max-w-[180px]"
                  />
                </div>
              </>
            ) : (
              <>
                <TextField
                  id={`${formId}-target-university`}
                  label={terms.targetOne}
                  value={value.target_university}
                  onChange={(v) => set({ target_university: v })}
                />
                <TextField
                  id={`${formId}-target-department`}
                  label={terms.targetTwo}
                  value={value.target_department}
                  onChange={(v) => set({ target_department: v })}
                />
                <TextField
                  id={`${formId}-target-ranking`}
                  label="Hedef Sıralama"
                  value={value.target_ranking}
                  onChange={(v) => set({ target_ranking: v })}
                />
              </>
            )}
          </section>

          <section className="space-y-3">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Akademik Durum</p>
            <TextField
              id={`${formId}-school`}
              label="Okul"
              value={value.school_name}
              onChange={(v) => set({ school_name: v })}
            />
            <TextField
              id={`${formId}-sinif-sube`}
              label="Sınıf/Şube"
              value={value.sinif_sube}
              onChange={(v) => set({ sinif_sube: v })}
            />
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-obp`}>{terms.grade}</Label>
              <Input
                id={`${formId}-obp`}
                type="number"
                inputMode="decimal"
                value={(isLgs ? value.report_card_average : value.obp) ?? ""}
                onChange={(e) => {
                  const next = e.target.value.trim() ? Number(e.target.value) : null;
                  set(isLgs ? { report_card_average: next } : { obp: next });
                }}
                className="max-w-[140px]"
              />
            </div>
            <SwitchField
              id={`${formId}-dershane`}
              label="Dershaneye Gidiyor mu?"
              checked={value.attends_dershane}
              onChange={(v) => set({ attends_dershane: v })}
            />
            <SwitchField
              id={`${formId}-deneme-kulubu`}
              label="Deneme Kulübüne Gidiyor mu?"
              checked={value.attends_deneme_kulubu}
              onChange={(v) => set({ attends_deneme_kulubu: v })}
            />
            <SwitchField
              id={`${formId}-ozel-ders`}
              label="Özel Ders Alıyor mu?"
              checked={value.has_private_tutor}
              onChange={(v) => set({ has_private_tutor: v })}
            />
            <SwitchField
              id={`${formId}-onceki-koclu`}
              label="Daha Önce Koçluk Almış mı?"
              checked={value.had_previous_coaching}
              onChange={(v) => set({ had_previous_coaching: v })}
            />
            {!isLgs && (
              <TextField
                id={`${formId}-yks-ranking`}
                label="Eski YKS Sıralaması / Notu"
                value={value.previous_yks_ranking}
                onChange={(v) => set({ previous_yks_ranking: v })}
              />
            )}
          </section>

          <section className="space-y-3">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Ders Analizi</p>
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-favorite`}>Keyif Alınan Dersler</Label>
              <Textarea
                id={`${formId}-favorite`}
                value={value.favorite_subjects ?? ""}
                onChange={(e) => set({ favorite_subjects: e.target.value || null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-difficult`}>Zorlanılan Dersler</Label>
              <Textarea
                id={`${formId}-difficult`}
                value={value.difficult_subjects ?? ""}
                onChange={(e) => set({ difficult_subjects: e.target.value || null })}
              />
            </div>
          </section>

          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
