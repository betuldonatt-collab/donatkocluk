import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function AdminProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
    : { data: null };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Profil</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hesap Bilgileri</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Ad Soyad</p>
            <p className="text-foreground font-medium">{profile?.full_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">E-posta</p>
            <p className="text-foreground font-medium">{user?.email ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Rol</p>
            <p className="text-foreground font-medium">Yönetici</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
