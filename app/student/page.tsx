import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function StudentHomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Ana Sayfa</h1>
        <p className="text-muted-foreground text-sm">Tekrar hoş geldin!</p>
      </header>

      <Card className="max-w-md">
        <CardHeader>
          <ClipboardList className="text-primary size-6" />
          <CardTitle className="text-base">Bugünün ödevleri seni bekliyor</CardTitle>
          <CardDescription>
            Günlük ve haftalık görevlerini görmek, işaretlemek ve kronometre
            fotoğrafını yüklemek için Ödevler sayfasına geç.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/student/odevler">Ödevlere Git</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
