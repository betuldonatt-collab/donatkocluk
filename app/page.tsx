import Link from "next/link";
import { GraduationCap, Users } from "lucide-react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/ui/brand-logo";

const PANELS = [
  {
    href: "/login?role=student",
    label: "Öğrenci Girişi",
    description: "Ödevlerini ve gelişimini takip et.",
    icon: GraduationCap,
  },
  {
    href: "/login?role=parent",
    label: "Veli Girişi",
    description: "Çocuğunun ilerlemesini izle.",
    icon: Users,
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-8">
        <div className="space-y-2 text-center">
          <div className="flex items-center justify-center gap-3">
            <BrandLogo className="size-14" />
            <h1 className="text-3xl font-semibold tracking-tight">
              Donat Koçluk
            </h1>
          </div>
          <p className="text-muted-foreground">
            Devam etmek için panelini seç.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PANELS.map(({ href, label, description, icon: Icon }) => (
            <Card key={href}>
              <CardHeader>
                <Icon className="text-muted-foreground size-6" />
                <CardTitle>{label}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full">
                  <Link href={href}>Giriş Yap</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-center text-sm">
          <Link href="/team" className="text-muted-foreground hover:underline">
            Ekip üyesi misin? Buradan giriş yap →
          </Link>
        </p>
      </div>
    </div>
  );
}
