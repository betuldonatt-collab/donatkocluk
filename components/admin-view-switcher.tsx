"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, GraduationCap, ShieldCheck, Users } from "lucide-react";

import { cn } from "@/lib/utils";

const VIEWS = [
  { href: "/student", label: "Öğrenci Görünümü", icon: GraduationCap },
  { href: "/parent", label: "Veli Görünümü", icon: Users },
  { href: "/coach", label: "Koç Görünümü", icon: ClipboardList },
  { href: "/admin", label: "Admin Görünümü", icon: ShieldCheck },
];

export function AdminViewSwitcher() {
  const pathname = usePathname();

  return (
    <div className="bg-foreground text-background sticky top-0 z-50 flex items-center gap-1 px-3 py-1.5 text-sm">
      <span className="text-background/60 mr-2 text-xs font-medium tracking-wide uppercase">
        Admin önizleme
      </span>
      {VIEWS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors",
              active ? "bg-background/20 font-medium" : "hover:bg-background/10",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
