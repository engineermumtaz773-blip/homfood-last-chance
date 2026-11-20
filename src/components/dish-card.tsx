"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Dish } from "@/lib/data";
import { useCart } from "@/components/cart-provider";
import { motion, useReducedMotion } from "framer-motion";
import { useSiteSettings } from "@/components/site-settings";
import { acquireScrollLock } from "@/lib/scroll-lock";
import { useKitchenAvailability } from "@/hooks/use-kitchen-availability";
import { recordRecentDish } from "@/lib/recent-dishes";
import { FavoriteButton } from "@/components/favorite-button";

function AnimatedPrice({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);

  useEffect(() => {
    let frame = 0;
    let startedAt = 0;
    const from = previousValue.current;
    const duration = 280;
    const animate = (now: number) => {
      if (!startedAt) startedAt = now;
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      const next = Math.round(from + (value - from) * eased);
      previousValue.current = next;
      setDisplayValue(next);
      if (progress < 1) frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  return <>{displayValue.toLocaleString()}</>;
}

export function DishCard({ dish, revealIndex = 0 }: { dish: Dish; revealIndex?: number }) {
  const [portionIndex, setPortionIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [instructions, setInstructions] = useState("");
  const [customizing, setCustomizing] = useState(false);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [imageFailed, setImageFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [spiceLevel, setSpiceLevel] = useState<"Mild" | "Medium" | "Hot">("Medium");
  const { addItem } = useCart();
  const router = useRouter();
  const { locale, t } = useSiteSettings();
  const reducedMotion = useReducedMotion();
  const kitchen = useKitchenAvailability();
  const portion = dish.portions[portionIndex];
  const localized = locale === "en" ? dish : dish.translations?.[locale] ?? dish;
  const available = dish.available !== false && kitchen?.available !== false;
  const addOns = [{ name: "Extra chutney", price: 0 }, { name: "Fresh salad", price: 120 }, { name: "Raita", price: 100 }];
  const addOnTotal = addOns.reduce((sum, addOn) => sum + (selectedAddOns.includes(addOn.name) ? addOn.price : 0), 0);
  const addToCart = (goToCheckout: boolean) => {
    const addOnNotes = selectedAddOns.map((name) => {
      const addOn = addOns.find((item) => item.name === name);
      return addOn && addOn.price > 0 ? `${name} (+Rs. ${addOn.price})` : name;
    }).join(", ");
    const notes = [`Spice: ${spiceLevel}`, addOnNotes ? `Add-ons: ${addOnNotes}` : "", instructions.trim()].filter(Boolean).join(" · ");
    addItem({ id: dish.id, name: localized.name, portion: portion.name, price: portion.price + addOnTotal, quantity, specialInstructions: notes || undefined });
    setCustomizing(false);
    setQuantity(1);
    setInstructions("");
    setSelectedAddOns([]);
    setSpiceLevel("Medium");
    if (goToCheckout) router.push("/checkout");
  };
  async function shareDish() {
    const url = `${window.location.origin}/menu#dish-${dish.id}`;
    try {
      if (navigator.share) await navigator.share({ title: localized.name, text: localized.description, url });
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setShareMessage("Link copied");
      } else setShareMessage("Sharing is not available in this browser.");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setShareMessage("Could not share this dish.");
    }
    window.setTimeout(() => setShareMessage(""), 2400);
  }
  useEffect(() => {
    if (!customizing) return;
    const releaseScrollLock = acquireScrollLock();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setCustomizing(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      releaseScrollLock();
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [customizing]);
  return (
    <motion.article id={`dish-${dish.id}`} className={`dish-card ${available ? "" : "dish-card-unavailable"}`} initial={reducedMotion ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .18 }} transition={{ duration: .4, delay: reducedMotion ? 0 : (revealIndex % 6) * .045 }} whileHover={reducedMotion ? undefined : { y: -6, rotateX: 2, rotateY: -2, transition: { type: "spring", stiffness: 260, damping: 22 } }} style={{ transformStyle: "preserve-3d", perspective: 900 }}>
      <div className="dish-image">
        <button type="button" className="dish-image-zoom" aria-label={`View ${localized.name} photo`} onClick={() => { recordRecentDish(dish.id); setLightboxOpen(true); }}>
        {dish.imageUrl && !imageFailed
        ? <motion.div className="dish-photo-motion" whileHover={reducedMotion ? undefined : { scale: 1.045, x: -3 }} transition={{ type: "spring", stiffness: 80, damping: 22 }}><Image src={dish.imageUrl} alt={localized.name} fill sizes="(max-width: 640px) 92vw, (max-width: 1000px) 45vw, 30vw" unoptimized className="dish-photo" onError={() => setImageFailed(true)} /></motion.div>
        : <span className="dish-image-fallback" role="img" aria-label={`${localized.name} image unavailable`}>{dish.image}</span>}
        </button>
        <FavoriteButton dishId={dish.id} />
      </div>
      <div className="dish-info">
        <div className="dish-title-row"><h3>{localized.name}</h3><span className="dish-price">Rs. <AnimatedPrice value={portion.price} /></span></div>
        <p className="dish-description">{localized.description}</p>
        <div className="dish-meta"><span aria-label={dish.rating ? `${dish.rating} ${t("rating")}` : "Rating not yet available"}>{dish.rating ? `★ ${dish.rating.toFixed(1)} (${dish.ratingCount ?? 0})` : "☆☆☆☆☆"}</span><span>{dish.servingSize ? `${t("weight")}: ${dish.servingSize}` : "◷  Est. 25–35 min"}</span></div>
        {(dish.dietaryTags?.length || !available) ? <div className="dish-tags">{dish.dietaryTags?.map((tag) => <span key={tag}>{tag}</span>)}{!available && <span className="dish-stock-out">{t("unavailable")}</span>}</div> : null}
        <div className="portion-picker" role="radiogroup" aria-label={`${t("portion")} ${localized.name}`}>
          {dish.portions.map((option, index) => (
            <button type="button" role="radio" aria-checked={portionIndex === index} key={option.name} onClick={() => setPortionIndex(index)} className={`portion-option ${portionIndex === index ? "selected" : ""}`}>
              {option.name} · Rs. {option.price}
            </button>
          ))}
        </div>
        <motion.button type="button" className="add-button" disabled={!available} whileTap={reducedMotion ? undefined : { scale: .96 }} onClick={() => setCustomizing(true)}>
          <span aria-hidden="true">＋</span> {available ? t("customize") : kitchen?.available === false ? "Kitchen closed" : t("unavailable")}
        </motion.button>
        <button type="button" className="dish-share-button" onClick={() => void shareDish()}>Share dish</button>
        {shareMessage && <small role="status">{shareMessage}</small>}
      </div>
      {lightboxOpen && typeof document !== "undefined" && createPortal(
        <div className="dish-lightbox" role="dialog" aria-modal="true" aria-label={`${localized.name} photo`} onMouseDown={(event) => { if (event.target === event.currentTarget) setLightboxOpen(false); }}>
          <button type="button" aria-label="Close photo" onClick={() => setLightboxOpen(false)}>×</button>
          {dish.imageUrl && !imageFailed ? <Image src={dish.imageUrl} alt={localized.name} width={1200} height={900} unoptimized /> : <span>{dish.image}</span>}
        </div>, document.body
      )}
      {customizing && typeof document !== "undefined" && createPortal(
        <div className="dish-dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setCustomizing(false);
        }}>
          <motion.section className="dish-dialog" role="dialog" aria-modal="true" aria-labelledby={`dish-dialog-${dish.id}`} initial={{ opacity: 0, y: 18, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: .98 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}>
            <button type="button" className="dish-dialog-close" aria-label="Close customization" onClick={() => setCustomizing(false)}>×</button>
            <span className="store-eyebrow">MADE FRESH TO ORDER</span>
            <h2 id={`dish-dialog-${dish.id}`}>{localized.name}</h2>
            <p>{localized.description}</p>
            <div className="dialog-field">
              <span className="dialog-label">{t("portion")}</span>
              <div className="portion-picker" role="radiogroup" aria-label={`Choose a portion of ${dish.name}`}>
                {dish.portions.map((option, index) => (
                  <button type="button" role="radio" aria-checked={portionIndex === index} key={option.name} onClick={() => setPortionIndex(index)} className={`portion-option ${portionIndex === index ? "selected" : ""}`}>
                    {option.name} · Rs. {option.price}
                  </button>
                ))}
              </div>
            </div>
            <div className="dialog-field">
              <span className="dialog-label">Optional add-ons</span>
              <div className="dialog-addon-list">
                {addOns.map((addOn) => <label key={addOn.name} className={`dialog-addon ${selectedAddOns.includes(addOn.name) ? "selected" : ""}`}><input type="checkbox" checked={selectedAddOns.includes(addOn.name)} onChange={(event) => setSelectedAddOns((current) => event.target.checked ? [...current, addOn.name] : current.filter((item) => item !== addOn.name))} /><span>{addOn.name}</span><b>{addOn.price ? `+ Rs. ${addOn.price}` : "Free"}</b></label>)}
              </div>
            </div>
            <label className="field dialog-field">Spice level<select value={spiceLevel} onChange={(event) => setSpiceLevel(event.target.value as "Mild" | "Medium" | "Hot")}><option>Mild</option><option>Medium</option><option>Hot</option></select></label>
            {(dish.allergens?.length || dish.nutrition) && <div className="dish-nutrition">
              {dish.allergens?.length ? <p><strong>Allergens:</strong> {dish.allergens.join(", ")}</p> : null}
              {dish.nutrition && <p><strong>Nutrition per serving:</strong> {dish.nutrition.calories ?? "—"} kcal · Protein {dish.nutrition.proteinGrams ?? "—"}g · Carbs {dish.nutrition.carbsGrams ?? "—"}g · Fat {dish.nutrition.fatGrams ?? "—"}g</p>}
            </div>}
            <label className="field dialog-field">{t("instructions")}<textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={240} placeholder="Any preferences for the kitchen? (optional)" /></label>
            <div className="dialog-bottom">
              <div className="quantity-control" aria-label={t("quantity")}>
                <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button>
                <span aria-live="polite">{quantity}</span>
                <button type="button" aria-label="Increase quantity" onClick={() => setQuantity((value) => value + 1)}>＋</button>
              </div>
              <motion.button type="button" className="add-button" whileTap={reducedMotion ? undefined : { scale: .96 }} onClick={() => { recordRecentDish(dish.id); addToCart(false); }}>{t("add")} · Rs. {(portion.price + addOnTotal) * quantity}</motion.button>
            </div>
            <motion.button type="button" className="add-button dialog-checkout-button" whileTap={reducedMotion ? undefined : { scale: .98 }} onClick={() => { recordRecentDish(dish.id); addToCart(true); }}>Add to cart & checkout <span aria-hidden="true">→</span></motion.button>
          </motion.section>
        </div>, document.body
      )}
    </motion.article>
  );
}
