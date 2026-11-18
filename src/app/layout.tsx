import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { CartProvider } from "@/components/cart-provider";
import { DealsProvider } from "@/components/deals-provider";
import { StorefrontShell } from "@/components/storefront-shell";
import { NavigationLoading } from "@/components/navigation-loading";
import { PwaRuntime } from "@/components/pwa-runtime";
import { SiteSettingsProvider } from "@/components/site-settings";
import { AmbientCursor } from "@/components/ambient-cursor";
import { ScrollUnlockOnMount } from "@/components/scroll-unlock-on-mount";
import { PwaInstallBanner } from "@/components/pwa-install-banner";
import { RealtimeSyncRuntime } from "@/components/realtime-sync-runtime";
import { CustomerSessionRuntime } from "@/components/customer-session-runtime";
import { FavoritesSyncRuntime } from "@/components/favorites-sync-runtime";

export const metadata: Metadata = {
  title: "Home Made Food | Fresh Homemade Food",
  description: "Fresh homemade meals prepared daily and delivered in Bahawalpur.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Home Made Food",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/app-icon.svg", type: "image/svg+xml" },
      { url: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <SiteSettingsProvider><CartProvider><DealsProvider>
          <ScrollUnlockOnMount />
          <PwaRuntime />
          <PwaInstallBanner />
          <RealtimeSyncRuntime />
          <CustomerSessionRuntime />
          <FavoritesSyncRuntime />
          <NavigationLoading />
          <StorefrontShell>{children}</StorefrontShell>
          <AmbientCursor />
        </DealsProvider></CartProvider></SiteSettingsProvider>
      </body>
    </html>
  );
}
