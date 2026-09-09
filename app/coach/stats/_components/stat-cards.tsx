import { CalendarClock, Star, Users, Workflow } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CoachStats } from "../types";

export function StatCards({ stats }: { stats: CoachStats }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Users className="text-muted-foreground size-4" />
          <CardTitle className="text-sm">Toplam Öğrenci Havuzu</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-foreground text-2xl font-semibold">{stats.activeCount + stats.inactiveCount}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {stats.activeCount} aktif · {stats.inactiveCount} ayrıldı
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <CalendarClock className="text-muted-foreground size-4" />
          <CardTitle className="text-sm">Ortalama Kalma Süresi</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-foreground text-2xl font-semibold">
            {stats.avgRetentionMonths === null ? "—" : `${stats.avgRetentionMonths} ay`}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">Aktif + ayrılan tüm öğrenciler üzerinden</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Star className="text-muted-foreground size-4" />
          <CardTitle className="text-sm">Genel Memnuniyet Puanı</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-foreground text-2xl font-semibold">
            {stats.avgRating === null ? "—" : `${stats.avgRating} ★`}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {stats.ratingCount === 0 ? "Henüz değerlendirme yok" : `${stats.ratingCount} değerlendirme`}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Workflow className="text-muted-foreground size-4" />
          <CardTitle className="text-sm">Operasyonel İş Yükü</CardTitle>
        </CardHeader>
        <CardContent>
          {/* "Planlanan" is the TOTAL -- a completed (or missed) session
              was inherently planned in the past too, so it's Bekleyen +
              Gerçekleşen + Gerçekleşmeyen, not just the still-pending
              subset. The old copy labeled the pending count alone as
              "planlanan", which read as if planned meant "still ahead". */}
          <p className="text-foreground text-2xl font-semibold">{stats.workload.total} planlanan</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {stats.workload.pending} bekleyen · {stats.workload.completed} gerçekleşen · {stats.workload.notHappened} gerçekleşmeyen
            <br />
            Zaman yönetimi amaçlı, performans skoru değildir.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
