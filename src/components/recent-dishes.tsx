"use client";

import { useEffect, useState } from "react";
import type { Dish } from "@/lib/data";
import { getRecentDishIds, RECENT_DISHES_EVENT } from "@/lib/recent-dishes";
import { useSiteSettings } from "@/components/site-settings";

export function RecentDishes({ dishes }: { dishes: Dish[] }) {
  const { t } = useSiteSettings();
  const [ids, setIds] = useState<number[]>([]);
  useEffect(() => {
    const update = () => setIds(getRecentDishIds());
    update();
    window.addEventListener(RECENT_DISHES_EVENT, update);
    return () => window.removeEventListener(RECENT_DISHES_EVENT, update);
  }, []);
  const recent = ids.map((id) => dishes.find((dish) => dish.id === id)).filter((dish): dish is Dish => Boolean(dish));
  if (!recent.length) return null;
  return (
    <section className="recent-dishes" aria-label={t("recentlyViewed")}>
      <h2>{t("recentlyViewed")}</h2>
      <div>{recent.map((dish) => <button key={dish.id} type="button" onClick={() => document.getElementById(`dish-${dish.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>{dish.name}</button>)}</div>
    </section>
  );
}
