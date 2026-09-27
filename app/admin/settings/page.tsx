import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UsernameCard } from "@/components/username-card";
import { getLoginName } from "@/lib/login-name";
import { PasswordForm } from "./_components/password-form";
import { ThemeToggle } from "./_components/theme-toggle";

export default async function AdminSettingsPage() {
  const username = await getLoginName();
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

        <UsernameCard username={username} />

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
