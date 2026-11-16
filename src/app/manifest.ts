import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Home Made Food - Fresh Kitchen POS",
    short_name: "HomeFood",
    id: "/app/mobile",
    description: "Fresh homemade meals prepared daily and delivered in Bahawalpur.",
    start_url: "/app/mobile",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#059669",
    icons: [
      { src: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Order Menu", url: "/menu", icons: [{ src: "/icons/app-icon-192.png", sizes: "192x192" }] },
      { name: "Daily Deals", url: "/daily-deals", icons: [{ src: "/icons/app-icon-192.png", sizes: "192x192" }] },
      { name: "Track Order", url: "/track-order", icons: [{ src: "/icons/app-icon-192.png", sizes: "192x192" }] },
      { name: "Customer Profile", url: "/profile", icons: [{ src: "/icons/app-icon-192.png", sizes: "192x192" }] },
    ],
  };
}
