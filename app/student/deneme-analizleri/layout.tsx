"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { useMaarifGrade } from "@/components/maarif-grade-context";

const TABS = [
  { href: "/student/deneme-analizleri/brans", label: "Branş Denemesi Analizi" },
  { href: "/student/deneme-analizleri/genel", label: "Genel Deneme Analizi" },
  { href: "/student/deneme-analizleri/gelisim-haritasi", label: "Gelişim Haritası" },
  { href: "/student/deneme-analizleri/karne", label: "Karnelerim" },
];

export default function DenemeAnalizleriLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // 9th graders: Branş and Genel Deneme analysis only (Gelişim Haritası and
  // Karnelerim are TYT/AYT-based).
  const isMaarif9 = useMaarifGrade() !== null;
  const tabs = isMaarif9 ? TABS.filter((t) => t.href.endsWith("/brans") || t.href.endsWith("/genel")) : TABS;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Deneme Analizleri</h1>
        <p className="text-muted-foreground text-sm">
          Çözdüğün branş ve genel denemelerde net gelişimini ve hata yaptığın konuları gör.
        </p>
      </header>

      <div className="bg-secondary mb-6 inline-flex rounded-lg p-1">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              pathname.startsWith(tab.href)
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {children}
    </div>
  );
}
