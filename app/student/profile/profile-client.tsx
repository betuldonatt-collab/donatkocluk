"use client";

import { useState } from "react";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { updateProfile, type ProfilePatch } from "./actions";

export type ProfileData = {
  id: string;
  full_name: string | null;
  coaching_start_date: string | null;
  assigned_meeting_day: string | null;
  city: string | null;
  phone: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  target_university: string | null;
  target_department: string | null;
  target_ranking: string | null;
  school_name: string | null;
  obp: number | null;
  attends_dershane: boolean;
  attends_deneme_kulubu: boolean;
  has_private_tutor: boolean;
  had_previous_coaching: boolean;
  previous_yks_ranking: string | null;
  favorite_subjects: string | null;
  difficult_subjects: string | null;
};

type FormState = {
  full_name: string;
  city: string;
  phone: string;
  parent_name: string;
  parent_phone: string;
  target_university: string;
  target_department: string;
  target_ranking: string;
  school_name: string;
  obp: string;
  attends_dershane: boolean;
  attends_deneme_kulubu: boolean;
  has_private_tutor: boolean;
  had_previous_coaching: boolean;
  previous_yks_ranking: string;
  favorite_subjects: string;
  difficult_subjects: string;
};

function toFormState(p: ProfileData | null): FormState {
  return {
    full_name: p?.full_name ?? "",
    city: p?.city ?? "",
    phone: p?.phone ?? "",
    parent_name: p?.parent_name ?? "",
    parent_phone: p?.parent_phone ?? "",
    target_university: p?.target_university ?? "",
    target_department: p?.target_department ?? "",
    target_ranking: p?.target_ranking ?? "",
    school_name: p?.school_name ?? "",
    obp: p?.obp?.toString() ?? "",
    attends_dershane: p?.attends_dershane ?? false,
    attends_deneme_kulubu: p?.attends_deneme_kulubu ?? false,
    has_private_tutor: p?.has_private_tutor ?? false,
    had_previous_coaching: p?.had_previous_coaching ?? false,
    previous_yks_ranking: p?.previous_yks_ranking ?? "",
    favorite_subjects: p?.favorite_subjects ?? "",
    difficult_subjects: p?.difficult_subjects ?? "",
  };
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "Henüz belirlenmedi";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function ProfileClient({ initialProfile }: { initialProfile: ProfileData | null }) {
  const [form, setForm] = useState<FormState>(() => toFormState(initialProfile));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const patch: ProfilePatch = {
        full_name: form.full_name.trim() || null,
        city: form.city.trim() || null,
        phone: form.phone.trim() || null,
        parent_name: form.parent_name.trim() || null,
        parent_phone: form.parent_phone.trim() || null,
        target_university: form.target_university.trim() || null,
        target_department: form.target_department.trim() || null,
        target_ranking: form.target_ranking.trim() || null,
        school_name: form.school_name.trim() || null,
        obp: form.obp.trim() === "" ? null : Number(form.obp),
        attends_dershane: form.attends_dershane,
        attends_deneme_kulubu: form.attends_deneme_kulubu,
        has_private_tutor: form.has_private_tutor,
        had_previous_coaching: form.had_previous_coaching,
        previous_yks_ranking: form.previous_yks_ranking.trim() || null,
        favorite_subjects: form.favorite_subjects.trim() || null,
        difficult_subjects: form.difficult_subjects.trim() || null,
      };
      await updateProfile(patch);
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sistem Bilgileri</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ReadOnlyField label="Koçluğa Başlama Tarihi" value={formatDate(initialProfile?.coaching_start_date ?? null)} />
          <ReadOnlyField
            label="Belirlenen Görüşme Günü"
            value={initialProfile?.assigned_meeting_day || "Henüz belirlenmedi"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kişisel Bilgiler</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Ad Soyad" value={form.full_name} onChange={(v) => set("full_name", v)} />
          <Field label="Şehir" value={form.city} onChange={(v) => set("city", v)} />
          <Field label="İletişim Numarası" value={form.phone} onChange={(v) => set("phone", v)} />
          <Field label="Veli Adı" value={form.parent_name} onChange={(v) => set("parent_name", v)} />
          <Field
            label="Veli İletişim Numarası"
            value={form.parent_phone}
            onChange={(v) => set("parent_phone", v)}
            className="sm:col-span-2"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Akademik Hedefler</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Hedef Üniversite" value={form.target_university} onChange={(v) => set("target_university", v)} />
          <Field label="Hedef Bölüm" value={form.target_department} onChange={(v) => set("target_department", v)} />
          <Field
            label="Hedef Sıralama"
            value={form.target_ranking}
            onChange={(v) => set("target_ranking", v)}
            placeholder="Örn: 50.000-60.000"
            className="sm:col-span-2"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Akademik Durum</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Okul Adı" value={form.school_name} onChange={(v) => set("school_name", v)} />
            <Field label="OBP" value={form.obp} onChange={(v) => set("obp", v)} type="number" />
          </div>

          <div className="space-y-3">
            <YesNoField
              label="Dershaneye Gidiyor mu?"
              checked={form.attends_dershane}
              onChange={(v) => set("attends_dershane", v)}
            />
            <YesNoField
              label="Deneme Kulübüne Gidiyor mu?"
              checked={form.attends_deneme_kulubu}
              onChange={(v) => set("attends_deneme_kulubu", v)}
            />
            <YesNoField
              label="Özel Ders Alıyor mu?"
              checked={form.has_private_tutor}
              onChange={(v) => set("has_private_tutor", v)}
            />
            <YesNoField
              label="Daha Önce Koçluk Almış mı?"
              checked={form.had_previous_coaching}
              onChange={(v) => set("had_previous_coaching", v)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="previous-yks">Eski YKS Sıralaması / Notu</Label>
            <Input
              id="previous-yks"
              value={form.previous_yks_ranking}
              onChange={(e) => set("previous_yks_ranking", e.target.value)}
              placeholder="Örn: 2025 YKS: 120.000. sıra"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ders Analizi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="favorite-subjects">Çalışmaktan en çok keyif alınan dersler</Label>
            <Textarea
              id="favorite-subjects"
              value={form.favorite_subjects}
              onChange={(e) => set("favorite_subjects", e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="difficult-subjects">Çalışırken en çok zorlanılan dersler</Label>
            <Textarea
              id="difficult-subjects"
              value={form.difficult_subjects}
              onChange={(e) => set("difficult_subjects", e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={handleSave} disabled={saving}>
          <Save className="size-4" />
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </Button>
        {savedAt && !saving && <span className="text-muted-foreground text-sm">Kaydedildi</span>}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  const id = `field-${label.toLocaleLowerCase("tr").replace(/\s+/g, "-")}`;
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function YesNoField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={`yn-${label}`} className="font-normal">
        {label}
      </Label>
      <Switch id={`yn-${label}`} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-foreground text-sm font-medium">{value}</p>
    </div>
  );
}
