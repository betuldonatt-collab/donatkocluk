"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpenCheck,
  ClipboardList,
  GraduationCap,
  Home,
  Library,
  Target,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/student", label: "Ana Sayfa", icon: Home },
  { href: "/student/odevler", label: "Ödevler", icon: ClipboardList },
  { href: "/student/paragraf-problem", label: "Paragraf/Problem Takibi", icon: Target },
  { href: "/student/kaynak-takibi", label: "Kaynak Takibi", icon: BookOpenCheck },
  { href: "/student/deneme-analizleri", label: "Deneme Analizleri", icon: BarChart3 },
  { href: "/student/kaynak-kutuphanesi", label: "Kaynak Kütüphanesi", icon: Library },
];

export function StudentSidebar() {
  const pathname = usePathname();

  return (
    <aside className="bg-primary text-primary-foreground fixed inset-y-0 left-0 hidden w-64 flex-col md:flex">
      <div className="flex items-center gap-2 px-6 py-5">
        <GraduationCap className="size-6" />
        <span className="font-semibold">Öğrenci Paneli</span>
      </div>
      <nav className="flex flex-col gap-1 px-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/student" ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary-foreground/15 font-medium text-primary-foreground"
                  : "text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
