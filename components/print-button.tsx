"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

// Opens the browser's print dialog (which is also "PDF olarak kaydet"). Hidden on the printed sheet itself.
export function PrintButton({ label = "Yazdır / PDF Kaydet" }: { label?: string }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
      <Printer className="size-4" />
      {label}
    </Button>
  );
}
