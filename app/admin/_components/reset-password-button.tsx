"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { manualResetPassword } from "../actions";

const RESET_PASSWORD = "123456";

// Replaces the old two-step email-link flow (PasswordLifeguard), which
// never actually rendered for real users -- every account here is
// phone-only with no reliable email on file. This is the one reset path
// that works: a single confirm click sets the password straight to a
// known value the admin can read out over the phone.
export function ResetPasswordButton({ userId }: { userId: string }) {
  const [resetting, setResetting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    if (!confirm(`Şifreyi "${RESET_PASSWORD}" olarak sıfırlamak istediğine emin misin?`)) return;
    setResetting(true);
    setError(null);
    setDone(false);
    try {
      await manualResetPassword(userId, RESET_PASSWORD);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={resetting}>
        {resetting ? "Sıfırlanıyor..." : "Şifreyi Sıfırla"}
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
      {done && !error && (
        <p className="text-muted-foreground text-xs">
          Şifre <span className="font-mono">{RESET_PASSWORD}</span> olarak sıfırlandı.
        </p>
      )}
    </div>
  );
}
