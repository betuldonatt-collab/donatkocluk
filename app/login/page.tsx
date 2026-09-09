import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";

import { LoginForm } from "./login-form";

const ROLE_LABELS: Record<string, string> = {
  student: "Öğrenci",
  parent: "Veli",
  coach: "Koç",
  admin: "Yönetici",
};

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const roleParam = typeof params.role === "string" ? params.role : "student";
  const role = roleParam in ROLE_LABELS ? roleParam : "student";
  const roleLabel = ROLE_LABELS[role];
  const isTeamRole = role === "coach" || role === "admin";

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <div className="flex items-center justify-center gap-2">
            <Logo className="size-12" />
            <span className="text-muted-foreground text-base font-semibold">Donat Koçluk</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {roleLabel} Girişi
          </h1>
          <p className="text-muted-foreground text-sm">
            {role === "admin" ? "Devam etmek için giriş yap." : "Devam etmek için giriş yap veya kayıt isteği gönder."}
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <LoginForm role={role} roleLabel={roleLabel} />
          </CardContent>
        </Card>

        <p className="text-center text-sm">
          <Link href={isTeamRole ? "/team" : "/"} className="text-muted-foreground hover:underline">
            ← Panel seçimine dön
          </Link>
        </p>
      </div>
    </div>
  );
}