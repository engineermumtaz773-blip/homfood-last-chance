"use client";

import { useMemo, useState } from "react";
import { DishCard } from "@/components/dish-card";
import { useLiveDishes } from "@/hooks/use-live-dishes";
import { dishesForCategoryOrAvailable, type Dish } from "@/lib/data";
import { useSiteSettings } from "@/components/site-settings";
import { matchesDishSearch } from "@/lib/menu-search";
import { RecentDishes } from "@/components/recent-dishes";

export function MenuCatalog({ initialDishes, initialCategory = "All", initialQuery = "" }: { initialDishes: Dish[]; initialCategory?: string; initialQuery?: string }) {
  const [category, setCategory] = useState(initialCategory);
  const [query, setQuery] = useState(initialQuery);
  const { t } = useSiteSettings();
  const liveCatalog = useLiveDishes(initialDishes);
  const filtered = useMemo(() => {
    const categoryDishes = category === "All" ? liveCatalog.dishes : dishesForCategoryOrAvailable(liveCatalog.dishes, category);
    return categoryDishes.filter((dish) => matchesDishSearch(dish, query));
  }, [category, liveCatalog.dishes, query]);
  return (
    <>
      <div className="menu-catalog-status"><span className={`catalog-sync ${liveCatalog.connected ? "connected" : "disconnected"}`}><i />{liveCatalog.connected ? "Menu updates automatically" : "Showing the last loaded menu"}</span></div>
      <RecentDishes dishes={liveCatalog.dishes} />
      <label className="menu-search"><span aria-hidden="true">⌕</span><input aria-label={t("searchMenu")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchMenu")} /></label>
      <div className="filter-row" role="group" aria-label="Filter dishes by category">
        {["All", "Breakfast", "Lunch", "Dinner", "Fast Food", "Traditional", "Snacks", "Sides", "Desserts & Drinks"].map((item) => <button key={item} type="button" className={`filter-chip ${category === item ? "active" : ""}`} aria-pressed={category === item} onClick={() => setCategory(item)}>{item === "All" ? t("all") : item === "Breakfast" ? t("breakfast") : item === "Lunch" ? t("lunch") : item === "Dinner" ? t("dinner") : item === "Fast Food" ? t("fastFood") : item === "Desserts & Drinks" ? t("desserts") : item}</button>)}
      </div>
      {filtered.length ? <div className="dish-grid">{filtered.map((dish, index) => <DishCard key={dish.id} dish={dish} revealIndex={index} />)}</div> : <p style={{ textAlign: "center", color: "var(--muted)" }}>No dishes are listed in this category yet.</p>}
    </>
  );
}
