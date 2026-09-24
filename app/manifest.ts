import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Donat Koçluk",
    short_name: "Donat Koçluk",
    description: "Öğrenci, Veli, Koç ve Admin panelleri",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "tr",
    // The icon artwork sits on white, so the splash screen matches it.
    background_color: "#ffffff",
    theme_color: "#f6f6f8",
    icons: [
      { src: "/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
