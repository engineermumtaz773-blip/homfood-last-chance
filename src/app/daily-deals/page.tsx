import { Suspense } from "react";
import { LoadingScreen } from "@/components/loading-screen";
import { LocalizedPageHero } from "@/components/localized-page-hero";
import { DailyDealsGrid } from "@/components/daily-deals-grid";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = buildPageMetadata({
  title: "Daily Homemade Food Deals",
  description: "Explore freshly prepared daily meal deals from Home Made Food in Bahawalpur.",
  path: "/daily-deals",
});

function DailyDealsContent() {
  return (
    <>
      <LocalizedPageHero eyebrow="dealsKicker" title="todayDeals" description="dealsIntro" />
      <section className="section"><DailyDealsGrid /></section>
    </>
  );
}

export default function DailyDealsPage() {
  return <Suspense fallback={<LoadingScreen />}><DailyDealsContent /></Suspense>;
}
