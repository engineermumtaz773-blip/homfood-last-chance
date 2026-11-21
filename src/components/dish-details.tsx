"use client";

import Image from "next/image";
import { useState } from "react";
import { useCart } from "@/components/cart-provider";
import { useSiteSettings } from "@/components/site-settings";
import type { Dish } from "@/lib/data";

const categoryTranslationKeys: Record<string, string> = {
  Breakfast: "breakfast",
  Lunch: "lunch",
  Dinner: "dinner",
  "Fast Food": "fastFood",
  "Desserts & Drinks": "desserts",
  Traditional: "traditional",
  Snacks: "snacks",
  Sides: "sides",
};

export function DishDetails({ dish }: { dish: Dish }) {
  const { t, locale, formatCurrency } = useSiteSettings();
  const { addItem } = useCart();
  const [message, setMessage] = useState("");
  const localized = locale === "en" ? dish : dish.translations?.[locale] || dish;
  const portion = dish.portions[0];

  function addToCart() {
    if (!portion) return;
    addItem({
      id: dish.id,
      name: localized.name,
      portion: portion.name,
      price: portion.price,
      quantity: 1,
    });
    setMessage(t("voiceOrderAdded"));
  }

  return (
    <article className="dish-detail-page">
      {dish.imageUrl ? (
        <div className="dish-detail-image">
          <Image src={dish.imageUrl} alt={localized.name} fill sizes="(max-width: 760px) 100vw, 50vw" unoptimized priority />
        </div>
      ) : (
        <div className="dish-detail-image dish-detail-image-fallback" aria-hidden="true">{dish.image}</div>
      )}
      <div className="dish-detail-content">
        <p className="eyebrow">{categoryTranslationKeys[dish.category] ? t(categoryTranslationKeys[dish.category]) : dish.category}</p>
        <h1>{localized.name}</h1>
        <p className="dish-detail-description">{localized.description || dish.description}</p>
        {dish.servingSize && <p className="dish-detail-portion">{t("portion")}: {dish.servingSize}</p>}
        <div className="dish-detail-prices">
          {dish.portions.map((item) => (
            <span key={`${dish.id}-${item.name}`}><b>{item.name}</b> {formatCurrency(item.price)}</span>
          ))}
        </div>
        <button type="button" className="add-button dish-detail-add" disabled={!dish.available || !portion} onClick={addToCart}>
          {dish.available ? t("addToCart") : t("unavailable")}
        </button>
        {message && <p className="dish-detail-status" role="status">{message}</p>}

        <section className="dish-detail-section">
          <h2>{t("ingredients")}</h2>
          {dish.ingredients?.length ? (
            <ul>{dish.ingredients.map((ingredient, index) => <li key={`${dish.id}-ingredient-${index}`}>{ingredient}</li>)}</ul>
          ) : <p>{t("ingredientsUnavailable")}</p>}
        </section>
        <section className="dish-detail-section">
          <h2>{t("preparation")}</h2>
          <p>{dish.preparation || t("recipeUnavailable")}</p>
        </section>
      </div>
    </article>
  );
}
