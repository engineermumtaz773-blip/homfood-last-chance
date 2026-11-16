import { OrderTracking } from "@/components/order-tracking";
import { LocalizedPageHero } from "@/components/localized-page-hero";

export default function TrackOrderPage() {
  return (
    <>
      <LocalizedPageHero eyebrow="trackKicker" title="trackTitle" description="trackIntro" />
      <section className="tracking-page-section"><OrderTracking /></section>
    </>
  );
}
