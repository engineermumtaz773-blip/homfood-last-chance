"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dish } from "@/lib/data";
import { matchesDishSearch } from "@/lib/menu-search";
import { SearchBar } from "@/components/search-bar";
import { VoiceOrder } from "@/components/voice-order";
import { trackFunnelEvent } from "@/lib/funnel";

export function MenuVoiceControls({ dishes }: { dishes: Dish[] }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => query.trim() ? dishes.filter((dish) => matchesDishSearch(dish, query)).slice(0, 5) : [], [dishes, query]);
  useEffect(() => {
    trackFunnelEvent("menu_loaded", { item_count: dishes.length });
  }, [dishes.length]);
  return (
    <section className="menu-voice-controls">
      <SearchBar value={query} onChange={setQuery} />
      {results.length > 0 && <ul aria-label="Menu search results">{results.map((dish) => <li key={dish.id}>{dish.name} · from PKR {Math.min(...dish.portions.map((portion) => portion.price))}</li>)}</ul>}
      <VoiceOrder dishes={dishes} />
    </section>
  );
}
