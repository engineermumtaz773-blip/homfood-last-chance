import { Suspense } from "react";
import { LoadingScreen } from "@/components/loading-screen";
import { LocalizedPageHero } from "@/components/localized-page-hero";
import { DailyDealsGrid } from "@/components/daily-deals-grid";

export const dynamic = "force-dynamic";

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
