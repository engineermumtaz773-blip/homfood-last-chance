"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Dish } from "@/lib/data";
import { matchesDishSearch } from "@/lib/menu-search";
import { SearchBar } from "@/components/search-bar";
import { VoiceOrder } from "@/components/voice-order";
import { trackFunnelEvent } from "@/lib/funnel";
import { AdaptiveStorefront } from "@/components/adaptive-storefront";
import { useSiteSettings } from "@/components/site-settings";

export function MenuVoiceControls({ dishes }: { dishes: Dish[] }) {
  const searchParams = useSearchParams();
  const search = searchParams.get("search") || "";
  useEffect(() => {
    trackFunnelEvent("menu_loaded", { item_count: dishes.length });
  }, [dishes.length]);
  return <MenuVoiceControlsContent key={search} dishes={dishes} initialQuery={search} />;
}

function MenuVoiceControlsContent({ dishes, initialQuery }: { dishes: Dish[]; initialQuery: string }) {
  const { t, formatCurrency } = useSiteSettings();
  const [query, setQuery] = useState(initialQuery);
  const filteredDishes = useMemo(
    () => query.trim() ? dishes.filter((dish) => matchesDishSearch(dish, query)) : dishes,
    [dishes, query],
  );
  const results = filteredDishes.slice(0, 5);
  return (
    <>
      <section className="menu-voice-controls">
        <SearchBar value={query} onChange={setQuery} />
        {query.trim() && (results.length > 0
          ? <ul aria-label={t("menuSearchResults")}>{results.map((dish) => <li key={dish.id}><Link href={`/dish/${dish.id}`}>{dish.name} · {t("from")} {formatCurrency(Math.min(...dish.portions.map((portion) => portion.price)))}</Link></li>)}</ul>
          : <p role="status">{t("noSearchResults")}</p>)}
        <VoiceOrder dishes={dishes} onSearch={setQuery} />
      </section>
      <AdaptiveStorefront dishes={filteredDishes} />
    </>
  );
}
