import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// viewport-fit=cover is what makes env(safe-area-inset-*) resolve to
// anything nonzero at all (see globals.css's own body rule) -- without
// it the page just sits inside the notch-safe area by default and those
// env() values are always 0. maximumScale/userScalable off matches this
// being an "Add to Home Screen" app, not a page someone pinch-zooms.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // Approximates --background (app/globals.css) in each theme -- the
  // literal token isn't usable here (this becomes a plain <meta> tag,
  // not CSS, so it can't reference a custom property).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a1f" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "Donat Koçluk",
    template: "%s | Donat Koçluk",
  },
  description: "Öğrenci, Veli, Koç ve Admin panelleri",
  // Added to the home screen, this is what launches the app without
  // Safari's own address bar/chrome instead of just bookmarking the page.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Donat Koçluk",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="tr"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
