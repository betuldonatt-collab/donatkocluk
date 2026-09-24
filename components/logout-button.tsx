"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";

import { signOut } from "@/app/login/actions";
import { cn } from "@/lib/utils";

// Sidebar footer row ("Çıkış Yap"), sits under the tour trigger in all
// four panels. The signOut server action clears the Supabase session +
// cookies and redirects to /login.
export function LogoutButton({ role, collapsed }: { role: string; collapsed: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => signOut(role))}
      aria-label="Çıkış Yap"
      title="Çıkış Yap"
      className={cn(
        "text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground mt-1 flex items-center gap-2.5 rounded-lg py-2 transition-colors disabled:opacity-60",
        collapsed ? "w-full justify-center" : "w-full px-2.5",
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center">
        <LogOut className="size-4" />
      </span>
      {!collapsed && <span className="text-sm font-medium">{pending ? "Çıkış yapılıyor..." : "Çıkış Yap"}</span>}
    </button>
  );
}
