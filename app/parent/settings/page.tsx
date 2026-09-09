import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getActiveStudentId } from "@/lib/parent-context";
import { PasswordForm } from "./_components/password-form";
import { PhoneForm } from "./_components/phone-form";
import { ThemeToggle } from "./_components/theme-toggle";

async function fetchSettingsData() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: parentProfile }, studentId] = await Promise.all([
    supabase.from("profiles").select("phone").eq("id", user.id).maybeSingle(),
    getActiveStudentId(),
  ]);

  const { data: student } = studentId
    ? await supabase
        .from("profiles")
        .select("full_name, school_name, target_university, target_department, city")
        .eq("id", studentId)
        .maybeSingle()
    : { data: null };

  return { parentPhone: parentProfile?.phone ?? null, student };
}

export default async function ParentSettingsPage() {
  const data = await fetchSettingsData();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Ayarlar</h1>
      </header>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Görünüm</CardTitle>
            <CardDescription>Açık veya koyu temayı seç</CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeToggle />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Öğrenci Bilgileri</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.student ? (
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground text-xs">Ad Soyad</p>
                  <p className="text-foreground font-medium">{data.student.full_name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Okul</p>
                  <p className="text-foreground font-medium">{data.student.school_name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Hedef Üniversite</p>
                  <p className="text-foreground font-medium">{data.student.target_university ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Hedef Bölüm</p>
                  <p className="text-foreground font-medium">{data.student.target_department ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Şehir</p>
                  <p className="text-foreground font-medium">{data.student.city ?? "—"}</p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Hesabınız henüz bir öğrenciyle ilişkilendirilmemiş.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">İletişim Bilgileri</CardTitle>
          </CardHeader>
          <CardContent>
            <PhoneForm initialPhone={data?.parentPhone ?? null} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Şifre Değiştir</CardTitle>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
