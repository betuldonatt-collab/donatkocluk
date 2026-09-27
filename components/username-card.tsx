import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// "Kullanıcı Adı": the name the person logs in with, shown read-only above the
// password section on every role's settings page. It can be seen but never
// changed here (a disabled field with no handlers, and nothing in the page
// submits it). Renders nothing when there is no login name to show (e.g. an
// admin viewing someone else's panel), so an impersonating admin never sees
// the wrong person's name.
export function UsernameCard({ username }: { username: string | null }) {
  if (!username) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Kullanıcı Adı</CardTitle>
        <CardDescription>Giriş yaparken kullandığın kullanıcı adı. Değiştirilemez.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Label htmlFor="settings-username">Kullanıcı Adı</Label>
          <Input id="settings-username" value={username} readOnly disabled aria-readonly="true" className="max-w-sm" />
        </div>
      </CardContent>
    </Card>
  );
}
