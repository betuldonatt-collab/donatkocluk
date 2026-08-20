import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";

import { LoginForm } from "./login-form";

const ROLE_LABELS: Record<string, string> = {
  student: "Öğrenci",
  parent: "Veli",
  coach: "Koç",
  admin: "Admin",
};

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const roleParam = typeof params.role === "string" ? params.role : "student";
  const role = roleParam in ROLE_LABELS ? roleParam : "student";
  const roleLabel = ROLE_LABELS[role];

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {roleLabel} Girişi
          </h1>
          <p className="text-muted-foreground text-sm">
            Devam etmek için giriş yap veya hesap oluştur.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <LoginForm role={role} roleLabel={roleLabel} />
          </CardContent>
        </Card>

        <p className="text-center text-sm">
          <Link href="/" className="text-muted-foreground hover:underline">
            ← Panel seçimine dön
          </Link>
        </p>
      </div>
    </div>
  );
}