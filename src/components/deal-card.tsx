"use client";

import { useState } from "react";
import { useCart } from "@/components/cart-provider";
import { motion, useReducedMotion } from "framer-motion";

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
      style={{
        transformStyle: "preserve-3d",
        perspective: 1000,
        boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
        transition: "box-shadow 0.2s ease",
      }}
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
        <span
          className="deal-badge"
          style={{
            background: "linear-gradient(135deg, #ea580c 0%, #c2410c 100%)",
            color: "#ffffff",
            fontWeight: 800,
            boxShadow: "0 4px 12px rgba(234, 88, 12, 0.3)",
          }}
        >
          Save Rs. {original - price}
        </span>
        <div className="dish-title-row" style={{ marginTop: 14 }}>
          <h3>{title}</h3>
          <span className="dish-price" style={{ color: "#059669", fontWeight: 800 }}>
            Rs. {price.toLocaleString()}
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
          Regularly Rs. {original.toLocaleString()}
        </p>
        <motion.button
          type="button"
          className="add-button"
          whileTap={reducedMotion ? undefined : { scale: 0.95 }}
          onClick={handleAdd}
          style={{
            background: justAdded
              ? "#10b981"
              : "linear-gradient(135deg, #059669 0%, #047857 100%)",
            color: "#ffffff",
            fontWeight: 800,
            boxShadow: justAdded
              ? "0 4px 14px rgba(16, 185, 129, 0.4)"
              : "0 4px 14px rgba(5, 150, 105, 0.28)",
            transition: "all 0.2s ease",
          }}
        >
          {justAdded ? "✓ Added to cart" : "+ Add deal to cart"}
        </motion.button>
      </div>
    </motion.article>
  );
}
