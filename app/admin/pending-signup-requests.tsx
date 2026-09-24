"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { approveSignupRequest, rejectSignupRequest } from "./actions";

type SignupRequest = {
  id: string;
  full_name: string;
  phone: string;
  requested_role: "student" | "parent" | "coach";
  // Only student requests carry a cohort (copied onto the profile on approval).
  exam_type?: "YKS" | "LGS" | null;
  is_maarif9?: boolean;
};

const ROLE_LABELS: Record<SignupRequest["requested_role"], string> = {
  student: "Öğrenci",
  parent: "Veli",
  coach: "Koç",
};

export function PendingSignupRequests({ requests }: { requests: SignupRequest[] }) {
  const [items, setItems] = useState(requests);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [approved, setApproved] = useState<Record<string, { phone: string; tempPassword: string }>>({});

  async function handleApprove(id: string) {
    setProcessingId(id);
    try {
      const result = await approveSignupRequest(id);
      setApproved((prev) => ({ ...prev, [id]: result }));
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(id: string) {
    setProcessingId(id);
    try {
      await rejectSignupRequest(id);
      setItems((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setProcessingId(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">Bekleyen kayıt isteği yok.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((request) => {
        const result = approved[request.id];
        return (
          <div key={request.id} className="border-border rounded-lg border p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="bg-secondary rounded px-1.5 py-0.5 font-medium">
                {ROLE_LABELS[request.requested_role]}
              </span>
              {request.requested_role === "student" && request.exam_type && (
                <span
                  className={
                    request.exam_type === "LGS"
                      ? "rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                      : "bg-secondary rounded px-1.5 py-0.5 text-[10px] font-medium"
                  }
                >
                  {request.is_maarif9 ? "9. Sınıf" : request.exam_type}
                </span>
              )}
              <span className="text-foreground text-sm font-medium">{request.full_name}</span>
              <span className="text-muted-foreground">{request.phone}</span>
            </div>

            {result ? (
              <div className="bg-emerald-500/10 rounded-md p-3 text-sm">
                <p className="text-emerald-700 font-medium">Hesap oluşturuldu.</p>
                <p className="text-muted-foreground mt-1">
                  Bu bilgileri telefonla ilet -- yalnızca bir kez gösterilir:
                </p>
                <p className="mt-1 font-mono">
                  {result.phone} / {result.tempPassword}
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" onClick={() => handleApprove(request.id)} disabled={processingId === request.id}>
                  {processingId === request.id ? "Onaylanıyor..." : "Onayla"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleReject(request.id)}
                  disabled={processingId === request.id}
                >
                  Reddet
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
