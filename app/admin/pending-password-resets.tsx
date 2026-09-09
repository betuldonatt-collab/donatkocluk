"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { resolvePasswordResetRequest } from "./actions";

type PasswordResetRequest = { id: string; phone: string; created_at: string; reason: string | null };

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

// Only a phone number, not a user id -- the requester was never
// authenticated, so there's nothing to link to directly. The admin looks
// the person up by phone (Koçlar / Öğrenci Havuzu / Veli Bağlantıları) and
// resets their password there with ResetPasswordButton; this queue is just
// "who's waiting", cleared by hand once handled.
export function PendingPasswordResets({ requests }: { requests: PasswordResetRequest[] }) {
  const [items, setItems] = useState(requests);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  async function handleResolve(id: string) {
    setResolvingId(id);
    try {
      await resolvePasswordResetRequest(id);
      setItems((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setResolvingId(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">Bekleyen şifre sıfırlama isteği yok.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((request) => (
        <div
          key={request.id}
          className={
            request.reason
              ? "border-destructive/40 bg-destructive/5 flex items-center justify-between gap-3 rounded-lg border p-3"
              : "border-border flex items-center justify-between gap-3 rounded-lg border p-3"
          }
        >
          <div>
            <p className="text-foreground text-sm font-medium">{request.phone}</p>
            {request.reason && (
              <p className="text-destructive mt-0.5 flex items-center gap-1 text-xs font-semibold">
                <ShieldAlert className="size-3.5 shrink-0" />
                {request.reason}
              </p>
            )}
            <p className="text-muted-foreground text-xs">{formatDateTime(request.created_at)}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => handleResolve(request.id)}
            disabled={resolvingId === request.id}
          >
            {resolvingId === request.id ? "İşleniyor..." : "Çözüldü"}
          </Button>
        </div>
      ))}
    </div>
  );
}
