"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { DishCard } from "@/components/dish-card";
import { useLiveDishes } from "@/hooks/use-live-dishes";
import { dishesForCategoryOrAvailable, type Dish } from "@/lib/data";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useSiteSettings } from "@/components/site-settings";
import { REALTIME_SYNC_EVENT } from "@/lib/realtime-client";
import type { StoreSettings } from "@/lib/store-db";
import { getKitchenAvailability } from "@/lib/kitchen-hours";

const categories = [
  { name: "Breakfast", icon: "🍳" },
  { name: "Lunch", icon: "🍱" },
  { name: "Dinner", icon: "🍛" },
  { name: "Daily Deals", icon: "🏷️" },
  { name: "Desi Food", icon: "🥘" },
  { name: "Fast Food", icon: "🍔" },
];

const promotions = [
  { eyebrow: "A little something special", title: "Up to 35% off", copy: "Enjoy your dinner offer", code: "Ask us about today’s dinner deals", theme: "promo-coral" },
  { eyebrow: "Good mornings start here", title: "Breakfast, made at home", copy: "Fresh favourites for an easier morning", code: "Explore the breakfast menu", theme: "promo-gold" },
  { eyebrow: "Made with care in Bahawalpur", title: "Dinner is sorted", copy: "Comforting homemade meals, delivered to your door", code: "Order from the kitchen", theme: "promo-green" },
];

const testimonials = [
  { quote: "The chana pulao tastes exactly like a Sunday lunch at home. Fresh, fragrant and delivered warm.", name: "Ayesha R.", meta: "University Chowk", avatar: "https://i.pravatar.cc/96?img=47" },
  { quote: "The portions are generous and the kitchen updates are so helpful. Home Made Food is now our go-to.", name: "Hamza K.", meta: "Model Town", avatar: "https://i.pravatar.cc/96?img=12" },
  { quote: "The crispy chicken burger is genuinely excellent. You can taste that it was made to order.", name: "Mariam S.", meta: "Goheer Town", avatar: "https://i.pravatar.cc/96?img=32" },
];

const reveal = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 },
};

export function StorefrontHome({ dishes }: { dishes: Dish[] }) {
  const { t } = useSiteSettings();
  const reduceMotion = useReducedMotion();
  const [activeCategory, setActiveCategory] = useState("All");
  const [promotionIndex, setPromotionIndex] = useState(0);
  const [heroIndex, setHeroIndex] = useState(0);
  const [titleIndex, setTitleIndex] = useState(0);
  const [testimonialIndex, setTestimonialIndex] = useState(0);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [statusClock, setStatusClock] = useState(() => Date.now());
  const liveCatalog = useLiveDishes(dishes);
  const heroSlides = useMemo(() => {
    const findDish = (terms: string[], fallback: string) => liveCatalog.dishes.find((dish) => terms.some((term) => dish.name.toLowerCase().includes(term)) && dish.imageUrl)?.imageUrl || fallback;
    return [
      { name: "BBQ Platter", image: findDish(["bbq", "barbecue", "grill"], "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=2200&q=88") },
      { name: "Crispy Chicken Burger", image: findDish(["burger", "crispy chicken"], "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=2200&q=88") },
      { name: "Chana Pulao", image: findDish(["chana pulao", "pulao"], "https://images.unsplash.com/photo-1596797038530-2c107229654b?auto=format&fit=crop&w=2200&q=88") },
    ];
  }, [liveCatalog.dishes]);
  const signatureDishes = ["BBQ Platter", "Crispy Chicken Burger", "Chana Pulao", "Aloo Palak"];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPromotionIndex((index) => (index + 1) % promotions.length);
    }, 5500);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setStatusClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setHeroIndex((index) => (index + 1) % heroSlides.length), 7000);
    return () => window.clearInterval(timer);
  }, [heroSlides.length]);
  useEffect(() => {
    const timer = window.setInterval(() => setTitleIndex((index) => (index + 1) % signatureDishes.length), 3200);
    return () => window.clearInterval(timer);
  }, [signatureDishes.length]);
  useEffect(() => {
    const timer = window.setInterval(() => setTestimonialIndex((index) => (index + 1) % testimonials.length), 5200);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        if (!response.ok) throw new Error(`Store settings request failed (${response.status}).`);
        const data = await response.json() as { settings?: typeof storeSettings };
        if (!data.settings) throw new Error("Supabase did not return store settings.");
        setStoreSettings(data.settings);
      } catch (error) {
        console.error("Could not refresh storefront settings from Supabase.", error);
        setStoreSettings(null);
      }
    };
    void loadSettings();
    const interval = window.setInterval(loadSettings, 5_000);
    const onSync = () => { void loadSettings(); };
    window.addEventListener(REALTIME_SYNC_EVENT, onSync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(REALTIME_SYNC_EVENT, onSync);
    };
  }, []);

  const visibleDishes = useMemo(() => {
    if (activeCategory === "All" || activeCategory === "Daily Deals") return liveCatalog.dishes;
    if (activeCategory === "Desi Food") {
      const matches = liveCatalog.dishes.filter((dish) => ["Breakfast", "Lunch", "Dinner"].includes(dish.category));
      return matches.length > 0 ? matches : liveCatalog.dishes.filter((dish) => dish.available !== false && dish.soldOut !== true);
    }
    return dishesForCategoryOrAvailable(liveCatalog.dishes, activeCategory);
  }, [activeCategory, liveCatalog.dishes]);

  const promotion = promotions[promotionIndex];
  const featuredDishes = useMemo(() => {
    const matches = ["bbq", "burger", "chana pulao"];
    const found = matches.map((term) => liveCatalog.dishes.find((dish) => dish.name.toLowerCase().includes(term))).filter((dish): dish is Dish => Boolean(dish));
    return found.length >= 3 ? found : liveCatalog.dishes.filter((dish) => dish.featured).slice(0, 3).concat(liveCatalog.dishes.slice(0, 3)).slice(0, 3);
  }, [liveCatalog.dishes]);
  const todayName = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Karachi" }).format(new Date(statusClock));
  const todayHours = storeSettings?.businessHours?.schedule?.[todayName];
  const mealSlots = storeSettings?.businessHours?.mealSlots || [];
  const kitchenAvailability = storeSettings ? getKitchenAvailability(storeSettings, new Date(statusClock)) : null;
  const isOpen = kitchenAvailability?.available ?? false;
  const statusTarget = (() => {
    const now = new Date(statusClock);
    const [hour, minute] = ((isOpen ? todayHours?.close : todayHours?.open) || "10:00").split(":").map(Number);
    const target = new Date(now);
    target.setHours(hour || 0, minute || 0, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    const totalMinutes = Math.max(0, Math.round((target.getTime() - now.getTime()) / 60000));
    return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
  })();

  return (
    <div className="storefront">
      {kitchenAvailability && !kitchenAvailability.available && (
        <div className="store-availability-notice" role="status">
          <strong>Ordering is paused</strong>
          <span>{kitchenAvailability.reason}</span>
        </div>
      )}
      {!storeSettings && kitchenAvailability?.available !== false && <div className="store-availability-notice" role="alert"><strong>Kitchen availability is unavailable</strong><span>We could not verify current store hours. Online checkout is disabled until settings reconnect.</span></div>}
      <section className="store-hero">
        <AnimatePresence mode="sync">
          <motion.div key={heroSlides[heroIndex].image} className="hero-slide" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.1 }}>
            <Image className="hero-slide-image" src={heroSlides[heroIndex].image} alt={`${heroSlides[heroIndex].name} from Home Made Food`} fill priority={heroIndex === 0} sizes="100vw" unoptimized />
          </motion.div>
        </AnimatePresence>
        <div className="hero-shade" />
        <div className="hero-steam hero-steam-one" />
        <div className="hero-steam hero-steam-two" />
        <div className="store-hero-copy">
          <span className="store-eyebrow"><span aria-hidden="true">●</span> {t("homeKicker")}</span>
          <h1>Homemade goodness,<br /><AnimatePresence mode="wait"><motion.em className={`hero-title-dish hero-title-dish-${titleIndex}`} key={signatureDishes[titleIndex]} initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -22 }} transition={{ duration: .45 }}>{signatureDishes[titleIndex]}</motion.em></AnimatePresence></h1>
          <p>{t("homeDescription")}</p>
          <div className="store-hero-actions">
            <motion.a className="store-primary-button" href="#popular-dishes" whileHover={reduceMotion ? undefined : { y: -2 }} whileTap={reduceMotion ? undefined : { scale: .97 }}>View Menu <span aria-hidden="true">→</span></motion.a>
            <motion.a className="store-secondary-button" href="/track-order" whileHover={reduceMotion ? undefined : { y: -2 }} whileTap={reduceMotion ? undefined : { scale: .97 }}>Track Order</motion.a>
          </div>
          <div className="hero-slide-dots" aria-label="Featured dishes">{heroSlides.map((slide, index) => <button type="button" key={slide.name} className={index === heroIndex ? "active" : ""} aria-label={`Show ${slide.name}`} onClick={() => setHeroIndex(index)} />)}</div>
        </div>
      </section>

      <motion.section className="store-section store-category-section" aria-labelledby="category-title" variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: .12 }} transition={{ duration: .6 }}>
        <div className="store-section-heading">
          <div><span className="store-eyebrow">{t("cravings")}</span><h2 id="category-title">{t("exploreMenu")}</h2></div>
          <Link href="/menu" className="store-text-link">{t("seeFullMenu")} <span aria-hidden="true">→</span></Link>
        </div>
        <div className="store-category-slider" aria-label="Food categories">
          {categories.map((category) => (
            <button
              type="button"
              key={category.name}
              className={`store-category ${activeCategory === category.name ? "active" : ""}`}
              aria-pressed={activeCategory === category.name}
              onClick={() => {
                setActiveCategory(category.name);
                document.getElementById("popular-dishes")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              <span className="store-category-icon" aria-hidden="true">{category.icon}{category.name === "Daily Deals" && <small className="category-discount-badge">−35%</small>}</span>
              <span>{category.name === "Breakfast" ? t("breakfast") : category.name === "Lunch" ? t("lunch") : category.name === "Dinner" ? t("dinner") : category.name}</span>
            </button>
          ))}
        </div>
      </motion.section>

      <motion.section className="store-section why-section" aria-labelledby="why-title" variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: .12 }} transition={{ duration: .6 }}>
        <div className="store-section-heading"><div><span className="store-eyebrow">THE HOME MADE DIFFERENCE</span><h2 id="why-title">Good food, thoughtfully delivered.</h2><p>From the first chop to the final doorstep handoff, we keep things personal, fresh and local.</p></div></div>
        <div className="why-grid">
          {[["✦", "Cooked in small batches", "Freshly prepared with familiar ingredients, never sitting on a shelf."], ["⌖", "Made for Bahawalpur", "A neighbourhood kitchen serving Model Town, Goheer Town and beyond."], ["♡", "Care in every detail", "Clear portions, responsive support and food that arrives warm."]].map(([icon, title, copy]) => <motion.article className="why-card glass-card" key={title} whileHover={reduceMotion ? undefined : { y: -7, scale: 1.015 }}><span className="why-icon">{icon}</span><h3>{title}</h3><p>{copy}</p></motion.article>)}
        </div>
      </motion.section>

      <motion.section className={`store-promo ${promotion.theme}`} aria-label="Promotions" variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: .12 }} transition={{ duration: .6 }}>
        <div className="store-promo-content">
          <span className="store-promo-eyebrow">{promotion.eyebrow}</span>
          <h2>{promotion.title}</h2>
          <p>{promotion.copy}</p>
          <span className="store-promo-code">{promotion.code}</span>
          <Link href="/daily-deals" className="store-promo-link">Explore today&apos;s menu <span aria-hidden="true">→</span></Link>
        </div>
        <motion.div className="store-promo-art" aria-hidden="true" animate={reduceMotion ? undefined : { y: ["-50%", "calc(-50% - 7px)", "-50%"], rotate: [-8, -5, -8] }} transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}><span>🥘</span><span>✦</span><span>🌶️</span></motion.div>
        <div className="store-promo-controls">
          <button type="button" aria-label="Previous promotion" onClick={() => setPromotionIndex((index) => (index + promotions.length - 1) % promotions.length)}>←</button>
          <span aria-live="polite">{promotionIndex + 1} / {promotions.length}</span>
          <button type="button" aria-label="Next promotion" onClick={() => setPromotionIndex((index) => (index + 1) % promotions.length)}>→</button>
        </div>
      </motion.section>

      <motion.section className="store-products-section" id="popular-dishes" aria-labelledby="popular-title" variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: .08 }} transition={{ duration: .6 }}>
        <div className="store-section-heading">
          <div><span className="store-eyebrow">COOKED WITH CARE</span><h2 id="popular-title">{activeCategory === "All" ? "Popular near you" : activeCategory === "Breakfast" ? t("breakfast") : activeCategory === "Lunch" ? t("lunch") : activeCategory === "Dinner" ? t("dinner") : activeCategory}</h2><p>{t("portion")}.</p></div>
          <div className="store-product-actions">          <span className={`catalog-sync ${liveCatalog.connected ? "connected" : "disconnected"}`} title={liveCatalog.connected ? "Menu refreshes automatically" : "Menu data is unavailable from Supabase"}><i />{liveCatalog.connected ? "Live menu" : "Menu unavailable"}</span><Link href="/menu" className="store-text-link">Browse all dishes <span aria-hidden="true">→</span></Link></div>
        </div>
        {visibleDishes.length
          ? <div className="store-dish-grid">{visibleDishes.map((dish, index) => <DishCard dish={dish} key={dish.id} revealIndex={index} />)}</div>
          : <p className="store-empty">No dishes are listed in this category just yet. Browse our full menu to see what&apos;s cooking.</p>}
      </motion.section>

      <motion.section className="store-section signature-section" aria-labelledby="signature-title" variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: .08 }} transition={{ duration: .65 }}>
        <div className="store-section-heading"><div><span className="store-eyebrow">SIGNATURES FROM THE KITCHEN</span><h2 id="signature-title">The dishes people come back for.</h2><p>Start with a favourite, then make it yours with portion and add-on choices.</p></div><Link href="/menu" className="store-text-link">See the full menu <span aria-hidden="true">→</span></Link></div>
        <div className="store-dish-grid signature-grid">{featuredDishes.map((dish, index) => <DishCard dish={dish} key={`signature-${dish.id}`} revealIndex={index} />)}</div>
      </motion.section>

      <motion.section className="store-section reviews-section" aria-labelledby="reviews-title" variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: .14 }} transition={{ duration: .6 }}>
        <div className="store-section-heading"><div><span className="store-eyebrow">FROM OUR TABLE</span><h2 id="reviews-title">Loved by local foodies.</h2></div></div>
        <div className="testimonial-stage">
          <AnimatePresence mode="wait"><motion.article key={testimonials[testimonialIndex].name} className="testimonial-card glass-card" initial={{ opacity: 0, x: 25 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -25 }} transition={{ duration: .35 }}><div className="testimonial-stars">★★★★★</div><blockquote>“{testimonials[testimonialIndex].quote}”</blockquote><div className="testimonial-author"><Image src={testimonials[testimonialIndex].avatar} alt="" width={48} height={48} unoptimized /><div><strong>{testimonials[testimonialIndex].name}</strong><span>{testimonials[testimonialIndex].meta} · Verified order</span></div></div></motion.article></AnimatePresence>
          <div className="testimonial-controls"><button type="button" aria-label="Previous testimonial" onClick={() => setTestimonialIndex((index) => (index + testimonials.length - 1) % testimonials.length)}>←</button><span>{testimonials[testimonialIndex].name}</span><button type="button" aria-label="Next testimonial" onClick={() => setTestimonialIndex((index) => (index + 1) % testimonials.length)}>→</button></div>
        </div>
      </motion.section>

      <motion.section className="store-section hours-section" aria-labelledby="hours-title" variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: .12 }} transition={{ duration: .6 }}>
        <div className="hours-card glass-card">
          <div className="hours-title"><div><span className="store-eyebrow">KITCHEN HOURS</span><h2 id="hours-title">Always know when we&apos;re cooking.</h2></div><span className={`store-open-status ${isOpen ? "open" : "closed"}`}><i />{isOpen ? `Open · closes in ${statusTarget}` : `Closed · opens in ${statusTarget}`}</span></div>
          <p className="hours-intro">Fresh orders are prepared daily in Bahawalpur. Today: <strong>{todayHours?.enabled === false ? "Closed" : todayHours ? `${todayHours.open} – ${todayHours.close}` : "10:00 – 23:00"}</strong>.</p>
          {mealSlots.length > 0 && <p className="hours-intro">Meal slots: <strong>{mealSlots.filter((slot) => slot.enabled).map((slot) => `${slot.name} ${slot.open}–${slot.close}`).join(" · ") || "Currently paused"}</strong>.</p>}
          {kitchenAvailability && !kitchenAvailability.available && <p className="store-closing-notice" role="status">{kitchenAvailability.reason}</p>}
          <div className="hours-list">{(todayHours ? [[todayName, todayHours]] : [["Daily", { open: "10:00", close: "23:00" }]]).map(([day, hours]) => <div className="hours-row" key={day as string}><strong>{day as string}</strong><span>{(hours as { open: string; close: string }).open} – {(hours as { open: string; close: string }).close}</span></div>)}</div>
        </div>
      </motion.section>

      <motion.section className="store-section contact-section" aria-labelledby="contact-title" variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: .12 }} transition={{ duration: .6 }}>
        <div className="store-section-heading"><div><span className="store-eyebrow">COME SAY HELLO</span><h2 id="contact-title">Your next homemade meal is close.</h2><p>Need help choosing? Our kitchen team is happy to help with portions, timing or delivery areas.</p></div></div>
        <div className="contact-grid home-contact-grid">
          <motion.a className="contact-card glass-card" href={`tel:${storeSettings?.restaurant?.phone || "+923096648932"}`} whileHover={reduceMotion ? undefined : { y: -5 }}><span className="contact-icon">☎</span><div><strong>Call the kitchen</strong><small>{storeSettings?.restaurant?.phone || "+92 309 6648932"}</small></div><span className="contact-arrow">↗</span></motion.a>
          <motion.a className="contact-card glass-card" href={`https://wa.me/${(storeSettings?.restaurant?.whatsapp || "923040537000").replace(/\D/g, "")}`} target="_blank" rel="noreferrer" whileHover={reduceMotion ? undefined : { y: -5 }}><span className="contact-icon whatsapp">◌</span><div><strong>WhatsApp us</strong><small>Quick answers from our team</small></div><span className="contact-arrow">↗</span></motion.a>
          <motion.div className="contact-card glass-card"><span className="contact-icon">⌖</span><div><strong>Find our kitchen</strong><small>{storeSettings?.restaurant?.address || "Goheer Town, Bahawalpur"}</small></div></motion.div>
        </div>
      </motion.section>

      <motion.section className="store-trust-strip" aria-label="Our service" variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: .12 }} transition={{ duration: .6 }}>
        <article><span aria-hidden="true">✿</span><div><strong>Made fresh daily</strong><small>Small batches, lots of care</small></div></article>
        <article><span aria-hidden="true">⌖</span><div><strong>Right here in Bahawalpur</strong><small>Local kitchen, local delivery</small></div></article>
        <article><span aria-hidden="true">♡</span><div><strong>Order your way</strong><small>Simple checkout via WhatsApp</small></div></article>
      </motion.section>
    </div>
  );
}
