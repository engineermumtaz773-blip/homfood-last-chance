import { Suspense } from "react";
import { LoadingScreen } from "@/components/loading-screen";
import { AdaptiveStorefront } from "@/components/adaptive-storefront";
import { MenuUnavailable } from "@/components/menu-unavailable";
import { getDishesSafely } from "@/lib/data";
import { buildPageMetadata, SITE_DESCRIPTION, SITE_NAME } from "@/lib/seo";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = buildPageMetadata({
  title: `${SITE_NAME} | Fresh Homemade Food in Bahawalpur`,
  description: SITE_DESCRIPTION,
  path: "/",
});

async function HomeContent() {
  const dishes = await getDishesSafely();
  if (!dishes) return <MenuUnavailable />;
  return <AdaptiveStorefront dishes={dishes} />;
}

export default function Home() {
  return <Suspense fallback={<LoadingScreen />}><HomeContent /></Suspense>;
}
