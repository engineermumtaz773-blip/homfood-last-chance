import { Suspense } from "react";
import { LoadingScreen } from "@/components/loading-screen";
import { AdaptiveStorefront } from "@/components/adaptive-storefront";
import { MenuUnavailable } from "@/components/menu-unavailable";
import { getDishesSafely } from "@/lib/data";
import { MenuVoiceControls } from "@/components/menu-voice-controls";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbStructuredData, buildPageMetadata, menuStructuredData } from "@/lib/seo";
import type { Metadata } from "next";

export const metadata: Metadata = buildPageMetadata({
  title: "Fresh Homemade Menu",
  description: "Explore freshly prepared homemade meals, portions, and daily favorites in Bahawalpur.",
  path: "/menu",
});

export const dynamic = "force-dynamic";

async function MenuContent() {
  const menu = await getDishesSafely();
  if (!menu) return <MenuUnavailable />;
  const faqData = menuStructuredData(menu);
  return <>
    <JsonLd data={faqData} />
    <JsonLd data={breadcrumbStructuredData([{ name: "Home", path: "/" }, { name: "Menu", path: "/menu" }])} />
    <MenuVoiceControls dishes={menu} />
    <AdaptiveStorefront dishes={menu} />
  </>;
}

export default function MenuPage() {
  return <Suspense fallback={<LoadingScreen />}><MenuContent /></Suspense>;
}
