import type { ReactNode } from "react";
import "./globals.css";
import { defaultMetadata } from "@/app/metadata";
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
import { JsonLd } from "@/components/json-ld";
import { MotionPreferences } from "@/components/motion-preferences";
import { restaurantStructuredData } from "@/lib/seo";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export const metadata = defaultMetadata;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <JsonLd data={restaurantStructuredData()} />
        <MotionPreferences>
          <SiteSettingsProvider><CartProvider><DealsProvider>
            <ScrollUnlockOnMount />
            <PwaRuntime />
            <PwaInstallBanner />
            <RealtimeSyncRuntime />
            <CustomerSessionRuntime />
            <FavoritesSyncRuntime />
            <NavigationLoading />
            <StorefrontShell>{children}</StorefrontShell>
            <ErrorBoundary label="ambient cursor"><AmbientCursor /></ErrorBoundary>
          </DealsProvider></CartProvider></SiteSettingsProvider>
        </MotionPreferences>
      </body>
    </html>
  );
}
