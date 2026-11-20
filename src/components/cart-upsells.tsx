"use client";

import { useEffect, useState } from "react";
import type { Dish } from "@/lib/data";
import { useCart } from "@/components/cart-provider";

type Upsell = { dish: Dish; label: string; defaultQty: number };

export function CartUpsells() {
  const { items, addItem } = useCart();
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
    <section className="cart-upsells" aria-label="Suggested dishes">
      <h3>Complete your meal</h3>
      {error && <p role="status">{error}</p>}
      {visible.map(({ dish, label, defaultQty }) => (
        <article className="cart-upsell-item" key={dish.id}>
          <div><strong>{dish.name}</strong><small>{label} · from PKR {Math.min(...dish.portions.map((portion) => portion.price))}</small></div>
          <button type="button" className="checkout-raast-select" onClick={() => addItem({
            id: dish.id,
            name: dish.name,
            portion: dish.portions[0]?.name || "Full Plate",
            price: dish.portions[0]?.price || 0,
            quantity: defaultQty,
          })}>Add</button>
        </article>
      ))}
    </section>
  );
}
