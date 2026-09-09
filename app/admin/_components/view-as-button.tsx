"use client";

import { useState } from "react";
import { Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { startImpersonation } from "@/lib/impersonation-actions";
import type { ImpersonationRole } from "@/lib/impersonation";

export function ViewAsButton({
  targetId,
  targetRole,
  targetName,
  label = "Kullanıcının Gözünden Gör",
}: {
  targetId: string;
  targetRole: ImpersonationRole;
  targetName: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    await startImpersonation({ targetId, targetRole, targetName: targetName || "İsimsiz Kullanıcı" });
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={loading}>
      <Eye className="size-4" />
      {loading ? "Yönlendiriliyor..." : label}
    </Button>
  );
}
