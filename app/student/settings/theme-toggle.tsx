"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

import { Switch } from "@/components/ui/switch";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoids a hydration mismatch: resolvedTheme is only known client-side
  // (it depends on the OS preference for "system"), so the switch renders
  // in a neutral state until after mount. This is next-themes' own
  // documented pattern for this exact problem -- a one-time mount flag,
  // not a state loop.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <div className="flex items-center gap-3">
      <Sun className="text-muted-foreground size-4" />
      <Switch
        checked={isDark}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        aria-label="Karanlık mod"
      />
      <Moon className="text-muted-foreground size-4" />
    </div>
  );
}
