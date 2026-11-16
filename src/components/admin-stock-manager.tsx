"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useLiveDishes } from "@/hooks/use-live-dishes";
import { useSiteSettings } from "@/components/site-settings";

export function AdminStockManager() {
  const stock = useLiveDishes([]);
  const reducedMotion = useReducedMotion();
  const { t } = useSiteSettings();
  return <section className="admin-panel admin-stock-panel" aria-labelledby="stock-heading">
    <div className="admin-panel-heading"><div><h2 id="stock-heading">Menu availability</h2><p>Changes save to the live menu and sync to the storefront.</p></div></div>
    <div className="admin-stock-list">{stock.dishes.map((dish) => <div className="admin-stock-row" key={dish.id}><span><strong>{dish.name}</strong><small>{dish.category}</small></span><span className={`admin-stock-status ${dish.available === false ? "out" : "in"}`}>{dish.available === false ? t("unavailable") : t("available")}</span><motion.button type="button" whileTap={reducedMotion ? undefined : { scale: .96 }} onClick={() => stock.setAvailability(dish.id, dish.available === false)} aria-pressed={dish.available !== false}>{dish.available === false ? "Mark available" : "Mark sold out"}</motion.button></div>)}</div>
  </section>;
}
