"use client";

import { DealCard } from "@/components/deal-card";
import { useDeals } from "@/components/deals-provider";

export function DailyDealsGrid() {
  const { deals } = useDeals();
  if (deals.length === 0) {
    return <p className="notice">There are no daily deals available right now. Please check back soon.</p>;
  }
  return (
    <div className="dish-grid">
      {deals.map((deal, index) => (
        <DealCard
          key={deal.id}
          id={deal.id}
          title={deal.title}
          description={deal.description}
          imageUrl={deal.imageUrl}
          price={deal.discountedPrice}
          original={deal.regularPrice}
          revealIndex={index}
        />
      ))}
    </div>
  );
}
