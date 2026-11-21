"use client";

import { useState } from "react";
import { useCart } from "@/components/cart-provider";
import { motion, useReducedMotion } from "framer-motion";
import { useSiteSettings } from "@/components/site-settings";

export function DealCard({
  id,
  title,
  description,
  imageUrl,
  price,
  original,
  revealIndex = 0,
}: {
  id: number;
  title: string;
  description: string;
  imageUrl: string;
  price: number;
  original: number;
  revealIndex?: number;
}) {
  const { addItem } = useCart();
  const { t, formatCurrency } = useSiteSettings();
  const reducedMotion = useReducedMotion();
  const [justAdded, setJustAdded] = useState(false);

  const handleAdd = () => {
    addItem({ id, name: title, portion: "Daily Deal", price });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 800);
  };

  return (
    <motion.article
      className="dish-card"
      initial={reducedMotion ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: 0.4, delay: reducedMotion ? 0 : (revealIndex % 6) * 0.06 }}
      whileHover={
        reducedMotion
          ? undefined
          : {
              y: -7,
              rotateX: 2,
              rotateY: -2,
              transition: { type: "spring", stiffness: 280, damping: 20 },
            }
      }
      style={{ transformStyle: "preserve-3d", perspective: 1000 }}
    >
      <div
        className="dish-image"
        role="img"
        aria-label={title}
        style={
          imageUrl
            ? {
                backgroundImage: `url("${imageUrl}")`,
                backgroundPosition: "center",
                backgroundSize: "cover",
              }
            : undefined
        }
      >
        {imageUrl ? null : "🍱"}
      </div>
      <div className="dish-info">
        <span className="deal-badge">
          {t("save")} {formatCurrency(original - price)}
        </span>
        <div className="dish-title-row" style={{ marginTop: 14 }}>
          <h3>{title}</h3>
          <span className="dish-price">
            {formatCurrency(price)}
          </span>
        </div>
        <p className="dish-description">{description}</p>
        <p
          style={{
            color: "var(--muted)",
            fontSize: 13,
            textDecoration: "line-through",
            margin: "4px 0 12px 0",
          }}
        >
          {t("regularly")} {formatCurrency(original)}
        </p>
        <motion.button
          type="button"
          className="add-button"
          whileTap={reducedMotion ? undefined : { scale: 0.95 }}
          onClick={handleAdd}
        >
          {justAdded ? `✓ ${t("addedToCart")}` : `+ ${t("addDealToCart")}`}
        </motion.button>
      </div>
    </motion.article>
  );
}
