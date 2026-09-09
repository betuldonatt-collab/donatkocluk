"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateCoachProfile, type CoachSpecialization } from "../actions";

const SPECIALIZATION_LABELS: Record<CoachSpecialization, string> = {
  yks_sayisal: "YKS-Sayısal",
  yks_ea: "YKS-EA",
  yks_sozel: "YKS-Sözel",
  yks_ydt: "YKS-YDT",
  lgs_ortaokul: "LGS/Ortaokul",
};

function selectClassName() {
  return "border-input bg-background flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";
}

function AdminOnlyBadge() {
  return (
    <span className="bg-slate-500/15 text-slate-700 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium">
      <Lock className="size-3" />
      Sadece Yöneticiler Görebilir
    </span>
  );
}

export function ProfileForm({
  email,
  fullName: initialFullName,
  avatarUrl: initialAvatarUrl,
  bio: initialBio,
  specialization: initialSpecialization,
  phone: initialPhone,
  emergencyContactName: initialEmergencyContactName,
  emergencyContactPhone: initialEmergencyContactPhone,
  emergencyContactRelationship: initialEmergencyContactRelationship,
  university: initialUniversity,
  city: initialCity,
}: {
  email: string;
  fullName: string;
  avatarUrl: string;
  bio: string;
  specialization: CoachSpecialization | null;
  phone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  university: string;
  city: string;
}) {
  const [fullName, setFullName] = useState(initialFullName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [bio, setBio] = useState(initialBio);
  const [specialization, setSpecialization] = useState<CoachSpecialization | "">(initialSpecialization ?? "");
  const [phone, setPhone] = useState(initialPhone);
  const [emergencyContactName, setEmergencyContactName] = useState(initialEmergencyContactName);
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(initialEmergencyContactPhone);
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState(initialEmergencyContactRelationship);
  const [university, setUniversity] = useState(initialUniversity);
  const [city, setCity] = useState(initialCity);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await updateCoachProfile({
        fullName: fullName.trim(),
        avatarUrl: avatarUrl.trim() || null,
        bio: bio.trim() || null,
        specialization: specialization || null,
        phone: phone.trim() || null,
        emergencyContactName: emergencyContactName.trim() || null,
        emergencyContactPhone: emergencyContactPhone.trim() || null,
        emergencyContactRelationship: emergencyContactRelationship.trim() || null,
        university: university.trim() || null,
        city: city.trim() || null,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Herkese Açık Bilgiler</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="avatar-url">Profil Fotoğrafı (URL)</Label>
            <Input id="avatar-url" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="full-name">Ad Soyad</Label>
            <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>E-posta</Label>
            <p className="text-muted-foreground text-sm">{email}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="specialization">Uzmanlık Alanı</Label>
            <select
              id="specialization"
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value as CoachSpecialization | "")}
              className={selectClassName()}
            >
              <option value="">Seçilmedi</option>
              {(Object.keys(SPECIALIZATION_LABELS) as CoachSpecialization[]).map((key) => (
                <option key={key} value={key}>
                  {SPECIALIZATION_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Özel Bilgiler</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="bio">Hakkımda (Biyografi)</Label>
              <AdminOnlyBadge />
            </div>
            <Textarea id="bio" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Kendinden kısaca bahset..." />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="phone">Telefon</Label>
              <AdminOnlyBadge />
            </div>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="emergency-name">Acil Durum Kişisi</Label>
              <AdminOnlyBadge />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Input
                id="emergency-name"
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
                placeholder="Ad Soyad"
              />
              <Input
                value={emergencyContactRelationship}
                onChange={(e) => setEmergencyContactRelationship(e.target.value)}
                placeholder="Yakınlık Durumu (Anne, Baba, Kardeş...)"
              />
              <Input
                value={emergencyContactPhone}
                onChange={(e) => setEmergencyContactPhone(e.target.value)}
                placeholder="Telefon"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="university">Üniversite/Eğitim</Label>
              <AdminOnlyBadge />
            </div>
            <Input id="university" value={university} onChange={(e) => setUniversity(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="city">Şehir</Label>
              <AdminOnlyBadge />
            </div>
            <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </Button>
        {saved && <span className="text-muted-foreground text-sm">Kaydedildi.</span>}
      </div>
    </div>
  );
}
