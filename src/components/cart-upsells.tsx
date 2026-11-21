"use client";

import { useEffect, useState } from "react";
import type { Dish } from "@/lib/data";
import { useCart } from "@/components/cart-provider";
import { useSiteSettings } from "@/components/site-settings";

type Upsell = { dish: Dish; label: string; defaultQty: number };

export function CartUpsells() {
  const { items, addItem } = useCart();
  const { t, locale, formatCurrency } = useSiteSettings();
  const [suggestions, setSuggestions] = useState<Upsell[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/cart-upsells", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { items?: Upsell[]; error?: string };
        if (!response.ok) throw new Error(data.error || `Cart suggestions failed (${response.status}).`);
        if (active) setSuggestions(Array.isArray(data.items) ? data.items : []);
      })
      .catch((cause: unknown) => {
        console.error("Could not load cart suggestions.", cause);
        if (active) setError(cause instanceof Error ? cause.message : "Cart suggestions are unavailable.");
      });
    return () => { active = false; };
  }, []);

  const visible = suggestions.filter(({ dish }) => dish.available !== false && !dish.soldOut && !items.some((item) => item.id === dish.id)).slice(0, 3);
  if (!visible.length && !error) return null;

  return (
    <section className="cart-upsells" aria-label={t("suggestedDishes")}>
      <h3>{t("completeMeal")}</h3>
      {error && <p role="status">{error}</p>}
      {visible.map(({ dish, label, defaultQty }) => (
        <article className="cart-upsell-item" key={dish.id}>
          <div><strong>{locale === "en" ? dish.name : dish.translations?.[locale]?.name || dish.name}</strong><small>{label} · {t("from")} {formatCurrency(Math.min(...dish.portions.map((portion) => portion.price)))}</small></div>
          <button type="button" className="checkout-raast-select" onClick={() => addItem({
            id: dish.id,
            name: dish.name,
            portion: dish.portions[0]?.name || "Full Plate",
            price: dish.portions[0]?.price || 0,
            quantity: defaultQty,
          })}>{t("add")}</button>
        </article>
      ))}
    </section>
  );
}
