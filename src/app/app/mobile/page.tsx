import { Suspense } from "react";
import { LoadingScreen } from "@/components/loading-screen";
import { NativeMobileHome } from "@/components/native-mobile-home";
import { MenuUnavailable } from "@/components/menu-unavailable";
import { getDishesSafely } from "@/lib/data";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = buildPageMetadata({
  title: "Home Made Food App",
  description: "Browse homemade meals and manage an order in the Home Made Food app.",
  path: "/app/mobile",
});

async function MobileContent() {
  const dishes = await getDishesSafely();
  if (!dishes) return <MenuUnavailable />;
  return <NativeMobileHome dishes={dishes} />;
}

export default function AppMobilePage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <MobileContent />
    </Suspense>
  );
}
