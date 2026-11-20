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
  const [maxPrice, setMaxPrice] = useState(5000);
  const [diet, setDiet] = useState("All");
  const [spice, setSpice] = useState("All");
  const { t } = useSiteSettings();
  const liveCatalog = useLiveDishes(initialDishes);
  const filtered = useMemo(() => {
    const categoryDishes = category === "All" ? liveCatalog.dishes : dishesForCategoryOrAvailable(liveCatalog.dishes, category);
    const diets = [...new Set(liveCatalog.dishes.flatMap((dish) => dish.dietaryTags || []))].sort();
    return categoryDishes.filter((dish) => matchesDishSearch(dish, query) && Math.min(...dish.portions.map((portion) => portion.price), Infinity) <= maxPrice && (diet === "All" || (dish.dietaryTags || []).includes(diet)) && (spice === "All" || (dish.dietaryTags || []).some((tag) => tag.toLowerCase().includes(spice.toLowerCase()))));
  }, [category, diet, liveCatalog.dishes, maxPrice, query, spice]);
  const diets = [...new Set(liveCatalog.dishes.flatMap((dish) => dish.dietaryTags || []))].sort();
  return (
    <>
      <div className="menu-catalog-status"><span className={`catalog-sync ${liveCatalog.connected ? "connected" : "disconnected"}`}><i />{liveCatalog.connected ? "Menu updates automatically" : "Showing the last loaded menu"}</span></div>
      <RecentDishes dishes={liveCatalog.dishes} />
      <label className="menu-search"><span aria-hidden="true">⌕</span><input aria-label={t("searchMenu")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchMenu")} /></label>
      <div className="filter-row" role="group" aria-label="Filter dishes by category">
        {["All", "Breakfast", "Lunch", "Dinner", "Fast Food", "Traditional", "Snacks", "Sides", "Desserts & Drinks"].map((item) => <button key={item} type="button" className={`filter-chip ${category === item ? "active" : ""}`} aria-pressed={category === item} onClick={() => setCategory(item)}>{item === "All" ? t("all") : item === "Breakfast" ? t("breakfast") : item === "Lunch" ? t("lunch") : item === "Dinner" ? t("dinner") : item === "Fast Food" ? t("fastFood") : item === "Desserts & Drinks" ? t("desserts") : item}</button>)}
      </div>
      <div className="filter-row" aria-label="More menu filters">
        <label className="filter-chip">Max price: PKR {maxPrice}<input aria-label="Maximum price in PKR" type="range" min="100" max="5000" step="100" value={maxPrice} onChange={(event) => setMaxPrice(Number(event.target.value))} /></label>
        <label className="filter-chip">Dietary preference<select aria-label="Dietary preference" value={diet} onChange={(event) => setDiet(event.target.value)}><option>All</option>{diets.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="filter-chip">Spice preference<select aria-label="Spice preference" value={spice} onChange={(event) => setSpice(event.target.value)}><option>All</option><option>mild</option><option>medium</option><option>spicy</option></select></label>
      </div>
      {filtered.length ? <div className="dish-grid">{filtered.map((dish, index) => <DishCard key={dish.id} dish={dish} revealIndex={index} />)}</div> : <p style={{ textAlign: "center", color: "var(--muted)" }}>No dishes are listed in this category yet.</p>}
    </>
  );
}
