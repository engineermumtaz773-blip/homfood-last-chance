"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { Dish } from "@/lib/data";
import { useLiveDishes } from "@/hooks/use-live-dishes";
import { useCart } from "@/components/cart-provider";
import { readCustomerProfile, CUSTOMER_AUTH_EVENT, type CustomerProfile } from "@/lib/customer";
import {
  generateEmvcoRaastQrString,
  RAAST_MERCHANT_IBAN,
  RAAST_MERCHANT_NAME,
  RAAST_REF_NUMBER,
} from "@/lib/emvco-qr";
import { QRCodeSVG } from "qrcode.react";
import { getFavoriteDishIds, FAVORITES_CHANGE_EVENT } from "@/lib/favorites";
import { useKitchenAvailability } from "@/hooks/use-kitchen-availability";

const POS_CATEGORIES = [
  { id: "All", name: "All", icon: "🥘" },
  { id: "Breakfast", name: "Breakfast", icon: "🍳" },
  { id: "Lunch", name: "Lunch", icon: "🍱" },
  { id: "Dinner", name: "Dinner", icon: "🍛" },
  { id: "Rice & Biryani", name: "Rice & Biryani", icon: "🍚" },
  { id: "Home Specials", name: "Home Specials", icon: "🏠" },
  { id: "Daily Deals", name: "Daily Deals", icon: "🏷️" },
  { id: "Fast Food", name: "Fast Food", icon: "🍔" },
  { id: "Favorites", name: "Favorites", icon: "❤️" },
];

export function DesktopPosLayout({ dishes: initialDishes }: { dishes: Dish[] }) {
  const liveCatalog = useLiveDishes(initialDishes);
  const kitchen = useKitchenAvailability();
  const { items, addItem, updateQuantity, removeItem, clearCart } = useCart();
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPrice, setFilterPrice] = useState<"all" | "under_300" | "300_600" | "600_plus">("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [serviceMode, setServiceMode] = useState<"delivery" | "takeout" | "dinein">("delivery");
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [addedDishId, setAddedDishId] = useState<number | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [selectedArea, setSelectedArea] = useState("Model Town, Bahawalpur");

  useEffect(() => {
    const initialRead = window.requestAnimationFrame(() => {
      setCustomer(readCustomerProfile());
      setFavoriteIds(getFavoriteDishIds());
    });
    const onFavoriteChange = () => setFavoriteIds(getFavoriteDishIds());
    const onAuth = (e: Event) => {
      const ce = e as CustomEvent<CustomerProfile | null>;
      setCustomer(ce.detail || null);
    };
    window.addEventListener(CUSTOMER_AUTH_EVENT, onAuth);
    window.addEventListener(FAVORITES_CHANGE_EVENT, onFavoriteChange);
    return () => {
      window.cancelAnimationFrame(initialRead);
      window.removeEventListener(CUSTOMER_AUTH_EVENT, onAuth);
      window.removeEventListener(FAVORITES_CHANGE_EVENT, onFavoriteChange);
    };
  }, []);

  useEffect(() => {
    if (!filterOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFilterOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [filterOpen]);

  const filteredDishes = useMemo(() => {
    return liveCatalog.dishes.filter((dish) => {
      const categories = [dish.category, ...(dish.categories || [])].map((category) => category.trim().toLowerCase());
      const normalizedCategory = selectedCategory.trim().toLowerCase();
      const matchesCategory =
        normalizedCategory === "all" ||
        (normalizedCategory === "favorites" && favoriteIds.includes(dish.id)) ||
        categories.includes(normalizedCategory) ||
        (normalizedCategory === "daily deals" &&
          (categories.some((category) => category.includes("deal")) ||
            (dish.dietaryTags && dish.dietaryTags.some((tag) => tag.toLowerCase().includes("deal")))));

      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        dish.name.toLowerCase().includes(query) ||
        dish.description.toLowerCase().includes(query) ||
        categories.some((category) => category.includes(query));
      const price = dish.portions?.[0]?.price || 0;
      const matchesPrice = filterPrice === "all" ||
        (filterPrice === "under_300" && price < 300) ||
        (filterPrice === "300_600" && price >= 300 && price <= 600) ||
        (filterPrice === "600_plus" && price > 600);

      return matchesCategory && matchesSearch && matchesPrice;
    });
  }, [liveCatalog.dishes, selectedCategory, searchQuery, filterPrice, favoriteIds]);

  // Financial Calculations
  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [items]
  );
  const deliveryFee = serviceMode === "delivery" ? (subtotal >= 1500 || subtotal === 0 ? 0 : 100) : 0;
  const grandTotal = subtotal + deliveryFee;

  // Universal Raast EMVCo String
  const emvcoPayload = useMemo(() => {
    return generateEmvcoRaastQrString({
      merchantName: RAAST_MERCHANT_NAME,
      ref: RAAST_REF_NUMBER,
      iban: RAAST_MERCHANT_IBAN,
      amount: grandTotal,
      city: "Bahawalpur",
      purpose: "Food Order",
    });
  }, [grandTotal]);

  const handleQuickAdd = (dish: Dish) => {
    const portion = dish.portions?.[0] || { name: "Standard", price: 0 };
    addItem({
      id: dish.id,
      name: dish.name,
      portion: portion.name,
      price: portion.price,
      quantity: 1,
    });
    setAddedDishId(dish.id);
    setTimeout(() => {
      setAddedDishId(null);
    }, 600);
  };

  const navLinks = [
    { label: "Home / Discover", icon: "⌂", active: selectedCategory === "All", category: "All" },
    { label: "Menu", icon: "🍽️", active: selectedCategory === "All", category: "All" },
    { label: "Daily Deals", icon: "🏷️", active: selectedCategory === "Daily Deals", category: "Daily Deals" },
    { label: "Track Order", href: "/track-order", icon: "🧾", active: false },
    { label: "Meal Plans", href: "/subscriptions", icon: "🥗", active: false },
    { label: "Favorites", icon: "❤️", active: selectedCategory === "Favorites", category: "Favorites" },
    { label: "Profile", href: "/profile", icon: "👤", active: false },
  ];

  return (
    <div
      className="desktop-pos-container"
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#f8fafc",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {/* ======================================================== */}
      {/* COLUMN 1: LEFT SIDEBAR NAVIGATION                        */}
      {/* ======================================================== */}
      <aside
        style={{
          width: "250px",
          background: "#ffffff",
          borderRight: "1px solid #e2e8f0",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "24px 16px",
          flexShrink: 0,
        }}
      >
        <div>
          {/* Brand Logo Box */}
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "0 8px 24px",
              borderBottom: "1px solid #f1f5f9",
              textDecoration: "none",
            }}
          >
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 16px rgba(16, 185, 129, 0.55)",
                border: "2px solid #10b981",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              <Image
                src="/image_6c70d8.jpg"
                alt="Home Made Food Logo"
                width={44}
                height={44}
                unoptimized
                style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 800,
                  color: "#0f172a",
                  fontFamily: "Outfit, sans-serif",
                  lineHeight: 1.2,
                }}
              >
                Home Made Food
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "#059669",
                  fontWeight: 700,
                  letterSpacing: "0.5px",
                }}
              >
                DESKTOP APP
              </div>
            </div>
          </Link>

          {/* Navigation Items */}
          <nav style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {navLinks.map((item) => (
              item.category ? (
              <motion.button
                key={item.label}
                type="button"
                onClick={() => setSelectedCategory(item.category!)}
                whileTap={{ scale: 0.98 }}
                style={{
                  position: "relative",
                  border: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  textDecoration: "none",
                  fontSize: "13px",
                  fontWeight: item.active ? 800 : 600,
                  background: item.active
                    ? "linear-gradient(135deg, #059669 0%, #047857 100%)"
                    : "transparent",
                  color: item.active ? "#ffffff" : "#475569",
                  boxShadow: item.active
                    ? "0 4px 14px rgba(5, 150, 105, 0.28)"
                    : "none",
                  transition: "all 0.15s ease",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                {item.active && <motion.span layoutId="desktop-sidebar-active" className="desktop-sidebar-active" />}
                <span style={{ position: "relative", zIndex: 1, fontSize: "16px" }}>{item.icon}</span>
                <span style={{ position: "relative", zIndex: 1 }}>{item.label}</span>
              </motion.button>
              ) : (
              <Link
                key={item.label}
                href={item.href || "/"}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  textDecoration: "none",
                  fontSize: "13px",
                  fontWeight: item.active ? 800 : 600,
                  background: item.active ? "linear-gradient(135deg, #059669 0%, #047857 100%)" : "transparent",
                  color: item.active ? "#ffffff" : "#475569",
                  boxShadow: item.active ? "0 4px 14px rgba(5, 150, 105, 0.28)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                {item.active && <motion.span layoutId="desktop-sidebar-active" className="desktop-sidebar-active" />}
                <span style={{ position: "relative", zIndex: 1, fontSize: "16px" }}>{item.icon}</span>
                <span style={{ position: "relative", zIndex: 1 }}>{item.label}</span>
              </Link>
              )
            ))}
          </nav>
        </div>

        {/* Bottom Kitchen Operational Status */}
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "14px",
            padding: "14px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "4px",
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: kitchen?.available ? "#10b981" : "#f59e0b",
                boxShadow: kitchen?.available ? "0 0 8px #10b981" : "0 0 8px #f59e0b",
              }}
            />
            <span
              style={{
                fontSize: "12px",
                fontWeight: 800,
                color: "#166534",
              }}
            >
              {kitchen === null ? "Checking kitchen" : kitchen.available ? "Kitchen Open" : "Kitchen Closed"}
            </span>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "11px",
              color: "#15803d",
              lineHeight: 1.4,
            }}
          >
            {kitchen?.reason || "Fresh home cooking and local delivery."}
          </p>
          <label className="desktop-delivery-area">
            Delivery area
            <select value={selectedArea} onChange={(event) => setSelectedArea(event.target.value)}>
              <option>Model Town, Bahawalpur</option>
              <option>Satellite Town, Bahawalpur</option>
              <option>Cantt Area, Bahawalpur</option>
              <option>City Center, Bahawalpur</option>
            </select>
          </label>
        </div>

      </aside>

      {/* ======================================================== */}
      {/* COLUMN 2: CENTER WORKSPACE (CATALOG & DISHES)             */}
      {/* ======================================================== */}
      <main
        className="desktop-app-workspace"
        style={{
          flex: 1,
          padding: "24px 28px",
          overflowY: "auto",
          maxHeight: "100vh",
        }}
      >
        {/* Top Control Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "20px",
            marginBottom: "20px",
            flexWrap: "wrap",
          }}
        >
          {/* Search Bar */}
          <div
            style={{
              position: "relative",
              flex: 1,
              maxWidth: "520px",
            }}
          >
            <span
              style={{
                position: "absolute",
                left: "14px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "#94a3b8",
                fontSize: "16px",
              }}
            >
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dishes, ingredients, daily deals..."
              style={{
                width: "100%",
                height: "44px",
                borderRadius: "14px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                paddingLeft: "42px",
                paddingRight: "14px",
                fontSize: "13px",
                color: "#0f172a",
                outline: "none",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Sync Status Badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              padding: "8px 14px",
              borderRadius: "12px",
              fontSize: "12px",
              color: "#334155",
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: liveCatalog.connected ? "#10b981" : "#f59e0b",
              }}
            />
            <span>{liveCatalog.connected ? "Real-time DB Sync" : "Cached Menu"}</span>
          </div>
          <div className="desktop-app-top-actions">
            <motion.button type="button" whileTap={{ scale: 0.97 }} aria-expanded={filterOpen} onClick={() => setFilterOpen(true)}>
              ⚙ Filters
            </motion.button>
            <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => setSelectedCategory("Favorites")}>
              ♥ Favorites <span className="desktop-app-badge">{favoriteIds.length}</span>
            </motion.button>
            <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => document.getElementById("app-cart")?.scrollIntoView({ behavior: "smooth" })}>
              🛍 Cart <motion.span key={items.reduce((sum, item) => sum + item.quantity, 0)} className="desktop-app-badge" initial={{ scale: 0.75 }} animate={{ scale: [1.15, 1] }} transition={{ duration: 0.22 }}>{items.reduce((sum, item) => sum + item.quantity, 0)}</motion.span>
            </motion.button>
            <Link href="/profile" className="desktop-app-profile-chip">
              {customer?.name || customer?.email?.split("@")[0] || "Profile"} <span>›</span>
            </Link>
            <motion.button
              type="button"
              className="desktop-app-website-toggle"
              aria-label="Switch to Website View"
              whileTap={{ scale: 0.97 }}
              onClick={() => window.dispatchEvent(new CustomEvent("hmf_view_mode_changed", { detail: "web" }))}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
              </svg>
              Website View
            </motion.button>
          </div>
        </div>

        <AnimatePresence>
          {filterOpen && (
            <motion.div
              className="desktop-filter-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onMouseDown={(event) => { if (event.target === event.currentTarget) setFilterOpen(false); }}
            >
              <motion.aside
                className="desktop-filter-drawer"
                role="dialog"
                aria-modal="true"
                aria-label="Filter menu"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", stiffness: 320, damping: 32 }}
              >
                <div className="desktop-filter-heading">
                  <div><span>REFINE YOUR MENU</span><h2>Filters</h2></div>
                  <button type="button" onClick={() => setFilterOpen(false)} aria-label="Close filters">×</button>
                </div>
                <strong>Price range</strong>
                {[
                  ["all", "Any price"],
                  ["under_300", "Under PKR 300"],
                  ["300_600", "PKR 300–600"],
                  ["600_plus", "PKR 600+"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={filterPrice === value ? "selected" : ""}
                    onClick={() => setFilterPrice(value as typeof filterPrice)}
                  >
                    {label}
                  </button>
                ))}
                <div className="desktop-filter-actions">
                  <button type="button" onClick={() => { setFilterPrice("all"); setSelectedCategory("All"); setSearchQuery(""); }}>Reset</button>
                  <button type="button" onClick={() => setFilterOpen(false)}>Show {filteredDishes.length} dishes</button>
                </div>
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Category Horizontal Filter Pills */}
        <div
          id="app-categories"
          className="desktop-app-categories"
          style={{
            display: "flex",
            gap: "10px",
            overflowX: "auto",
            paddingBottom: "14px",
            marginBottom: "16px",
            scrollbarWidth: "none",
          }}
        >
          {POS_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.name;
            return (
              <motion.button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.name)}
                whileTap={{ scale: 0.97 }}
                aria-pressed={isSelected}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "9px 16px",
                  borderRadius: "12px",
                  border: isSelected ? "1px solid transparent" : "1px solid #cbd5e1",
                  background: "transparent",
                  color: isSelected ? "#ffffff" : "#334155",
                  fontSize: "13px",
                  fontWeight: isSelected ? 800 : 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  boxShadow: isSelected
                    ? "0 4px 12px rgba(5, 150, 105, 0.28)"
                    : "0 1px 3px rgba(0,0,0,0.03)",
                  transition: "all 0.15s ease",
                  flexShrink: 0,
                }}
              >
                {isSelected && <motion.span layoutId="desktop-category-active" className="desktop-category-active" />}
                <span style={{ position: "relative", zIndex: 1 }}>{cat.icon}</span>
                <span style={{ position: "relative", zIndex: 1 }}>{cat.name}</span>
              </motion.button>
            );
          })}
        </div>

        <motion.div
          className="desktop-app-promo"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <span>HOUSE FAVORITES</span>
          <strong>Special Dinner &amp; Lunch Deals</strong>
          <p>Freshly prepared, delivered across Bahawalpur.</p>
          <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => setSelectedCategory("Daily Deals")}>View Deals <span>→</span></motion.button>
        </motion.div>
        <div className="desktop-app-tracker-bar">
          <span><strong>Order in progress?</strong> Follow kitchen updates and delivery status.</span>
          <Link href="/track-order">Track an order <span aria-hidden="true">→</span></Link>
        </div>

        {/* Section Header */}
        <div
          className="desktop-app-dish-heading"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "20px",
                fontWeight: 800,
                color: "#0f172a",
                fontFamily: "Outfit, sans-serif",
              }}
            >
              Special Menu for you
            </h2>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              Showing {filteredDishes.length} dishes
            </span>
          </div>
        </div>

        {/* 3-to-4 Columns Dish Cards Grid */}
        <div
          className="desktop-app-dish-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "18px",
          }}
        >
          {liveCatalog.loading && liveCatalog.dishes.length === 0 ? (
            Array.from({ length: 8 }, (_, index) => <div key={`desktop-dish-skeleton-${index}`} className="desktop-dish-skeleton" aria-hidden="true" />)
          ) : filteredDishes.length === 0 ? (
            <div className="desktop-app-empty-state">
              <strong>No dishes found</strong>
              <span>Try another search or reset your filters.</span>
              <button type="button" onClick={() => { setSelectedCategory("All"); setSearchQuery(""); setFilterPrice("all"); }}>Reset Filters</button>
            </div>
          ) : filteredDishes.map((dish, index) => {
            const portion = dish.portions?.[0] || { name: "Standard", price: 0 };
            const available = dish.available !== false;
            const isJustAdded = addedDishId === dish.id;

            return (
              <motion.div
                key={dish.id}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: available ? 1 : 0.6, y: 0 }}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.25, delay: Math.min(index * 0.025, 0.3) }}
                className="desktop-app-dish-card"
                style={{
                  background: "#ffffff",
                  borderRadius: "16px",
                  border: "1px solid #e2e8f0",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
                  transition: "transform 0.15s ease, box-shadow 0.15s ease",
                }}
              >
                {/* Dish Photo */}
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "140px",
                    background: "#f1f5f9",
                  }}
                >
                  {dish.imageUrl ? (
                    <Image
                      src={dish.imageUrl}
                      alt={dish.name}
                      fill
                      sizes="300px"
                      unoptimized
                      style={{ objectFit: "cover" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "44px",
                        background: "linear-gradient(135deg, #fef3c7, #fde68a)",
                      }}
                    >
                      {dish.image || "🍲"}
                    </div>
                  )}

                  <span
                    style={{
                      position: "absolute",
                      top: "8px",
                      left: "8px",
                      background: "rgba(255,255,255,0.9)",
                      backdropFilter: "blur(4px)",
                      padding: "2px 6px",
                      borderRadius: "6px",
                      fontSize: "10px",
                      fontWeight: 800,
                      color: "#b45309",
                    }}
                  >
                    ★ {dish.rating ? dish.rating.toFixed(1) : "4.9"}
                  </span>

                  {!available && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: "rgba(15,23,42,0.65)",
                        color: "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        fontWeight: 800,
                      }}
                    >
                      UNAVAILABLE
                    </div>
                  )}
                </div>

                {/* Dish Details */}
                <div
                  style={{
                    padding: "12px",
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <h3
                      style={{
                        margin: "0 0 4px 0",
                        fontSize: "14px",
                        fontWeight: 700,
                        color: "#0f172a",
                        lineHeight: 1.3,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {dish.name}
                    </h3>
                    <p
                      style={{
                        margin: "0 0 10px 0",
                        fontSize: "11px",
                        color: "#64748b",
                        lineHeight: 1.4,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {dish.description}
                    </p>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: "auto",
                      paddingTop: "8px",
                      borderTop: "1px solid #f1f5f9",
                    }}
                  >
                    <div>
                      <span style={{ fontSize: "10px", color: "#64748b", display: "block" }}>
                        {portion.name}
                      </span>
                      <span
                        style={{
                          fontSize: "14px",
                          fontWeight: 800,
                          color: "#059669",
                        }}
                      >
                        PKR {portion.price.toLocaleString()}
                      </span>
                    </div>

                    <motion.button
                      type="button"
                      disabled={!available}
                      onClick={() => handleQuickAdd(dish)}
                      whileTap={{ scale: 0.97 }}
                      style={{
                        background: isJustAdded
                          ? "#10b981"
                          : available
                          ? "linear-gradient(135deg, #059669 0%, #047857 100%)"
                          : "#cbd5e1",
                        color: "#ffffff",
                        border: "none",
                        padding: "7px 14px",
                        borderRadius: "10px",
                        fontSize: "12px",
                        fontWeight: 800,
                        cursor: available ? "pointer" : "default",
                        boxShadow: available
                          ? "0 2px 8px rgba(5, 150, 105, 0.28)"
                          : "none",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {isJustAdded ? "✓ Added" : "+ ADD"}
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </main>

      {/* ======================================================== */}
      {/* COLUMN 3: RIGHT SIDEBAR (ORDER DETAILS / POS REGISTER)    */}
      {/* ======================================================== */}
      <aside
        id="app-cart"
        className="desktop-app-cart"
        style={{
          width: "360px",
          background: "#ffffff",
          borderLeft: "1px solid #e2e8f0",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "20px 20px 24px",
          flexShrink: 0,
          maxHeight: "calc(100vh - 88px)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: "14px",
              borderBottom: "1px solid #f1f5f9",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "18px",
                  fontWeight: 800,
                  color: "#0f172a",
                  fontFamily: "Outfit, sans-serif",
                }}
              >
                Order Details
              </h2>
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                Active Kitchen Register
              </span>
            </div>

            {items.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                style={{
                  background: "#fee2e2",
                  color: "#dc2626",
                  border: "none",
                  padding: "5px 10px",
                  borderRadius: "8px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Clear All
              </button>
            )}
          </div>

          {/* Customer Info Card */}
          <div
            style={{
              marginTop: "12px",
              padding: "10px 12px",
              background: "#f8fafc",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: customer ? "#ecfdf5" : "#f1f5f9",
                  color: customer ? "#059669" : "#64748b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: "13px",
                }}
              >
                {customer?.name ? customer.name.charAt(0).toUpperCase() : "👤"}
              </div>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a" }}>
                  {customer?.name || "Walk-in Guest"}
                </div>
                <div style={{ fontSize: "10px", color: "#64748b" }}>
                  {customer?.phone || "Bahawalpur Delivery"}
                </div>
              </div>
            </div>

            <Link
              href="/profile"
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "#059669",
                textDecoration: "none",
              }}
            >
              {customer ? "Account" : "Sign In"}
            </Link>
          </div>

          {/* Service Mode Selector */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "6px",
              margin: "12px 0",
              padding: "4px",
              background: "#f1f5f9",
              borderRadius: "12px",
            }}
          >
            {[
              { id: "delivery", label: "🛵 Delivery" },
              { id: "takeout", label: "🛍️ Takeout" },
              { id: "dinein", label: "🍽️ Dine In" },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setServiceMode(mode.id as typeof serviceMode)}
                style={{
                  padding: "6px 4px",
                  borderRadius: "9px",
                  border: "none",
                  background: serviceMode === mode.id ? "#ffffff" : "transparent",
                  color: serviceMode === mode.id ? "#059669" : "#64748b",
                  fontWeight: serviceMode === mode.id ? 800 : 600,
                  fontSize: "11px",
                  cursor: "pointer",
                  boxShadow: serviceMode === mode.id ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                }}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* Active Cart Line Items */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              paddingRight: "4px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {items.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 10px",
                  color: "#94a3b8",
                  fontSize: "13px",
                }}
              >
                <div style={{ fontSize: "36px", marginBottom: "8px" }}>🛒</div>
                <div style={{ fontWeight: 600 }}>Your order is empty</div>
                <div style={{ fontSize: "11px", marginTop: "4px" }}>
                  Click [+ ADD] on any menu item to start order
                </div>
              </div>
            ) : (
              items.map((line) => (
                <div
                  key={`${line.id}-${line.portion}-${line.specialInstructions || ""}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px",
                    background: "#f8fafc",
                    borderRadius: "12px",
                    border: "1px solid #f1f5f9",
                  }}
                >
                  <div style={{ flex: 1, paddingRight: "8px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
                      {line.name}
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>
                      {line.portion} · PKR {line.price.toLocaleString()}
                    </div>
                  </div>

                  {/* Quantity Stepper */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "#ffffff",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      padding: "2px 4px",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        updateQuantity(
                          line.id,
                          line.portion,
                          line.quantity - 1,
                          line.specialInstructions
                        )
                      }
                      style={{
                        width: "22px",
                        height: "22px",
                        border: "none",
                        background: "#f1f5f9",
                        borderRadius: "6px",
                        fontSize: "13px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      −
                    </button>
                    <span
                      style={{
                        minWidth: "18px",
                        textAlign: "center",
                        fontSize: "12px",
                        fontWeight: 800,
                      }}
                    >
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateQuantity(
                          line.id,
                          line.portion,
                          line.quantity + 1,
                          line.specialInstructions
                        )
                      }
                      style={{
                        width: "22px",
                        height: "22px",
                        border: "none",
                        background: "#f1f5f9",
                        borderRadius: "6px",
                        fontSize: "13px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      removeItem(line.id, line.portion, line.specialInstructions)
                    }
                    style={{
                      marginLeft: "8px",
                      border: "none",
                      background: "transparent",
                      color: "#94a3b8",
                      fontSize: "14px",
                      cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Financial Calculation Breakdown */}
          <div
            style={{
              paddingTop: "14px",
              borderTop: "1px solid #e2e8f0",
              marginTop: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "12px",
                color: "#64748b",
                marginBottom: "4px",
              }}
            >
              <span>Subtotal</span>
              <span style={{ fontWeight: 600 }}>PKR {subtotal.toLocaleString()}</span>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "12px",
                color: "#64748b",
                marginBottom: "4px",
              }}
            >
              <span>Delivery Fee ({serviceMode})</span>
              <span style={{ fontWeight: 600 }}>
                {deliveryFee === 0 ? "FREE" : `PKR ${deliveryFee}`}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "16px",
                fontWeight: 800,
                color: "#0f172a",
                paddingTop: "8px",
                marginTop: "4px",
                borderTop: "1px dashed #e2e8f0",
              }}
            >
              <span>Total Amount</span>
              <span style={{ color: "#059669" }}>PKR {grandTotal.toLocaleString()}</span>
            </div>

            {/* Instant Raast Dynamic QR Charge Button */}
            <button
              type="button"
              disabled={items.length === 0}
              onClick={() => setIsQrModalOpen(true)}
              style={{
                width: "100%",
                height: "48px",
                marginTop: "14px",
                borderRadius: "14px",
                border: "none",
                background:
                  items.length === 0
                    ? "#cbd5e1"
                    : "linear-gradient(135deg, #059669 0%, #047857 100%)",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 800,
                cursor: items.length === 0 ? "not-allowed" : "pointer",
                boxShadow:
                  items.length === 0 ? "none" : "0 4px 16px rgba(5, 150, 105, 0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "all 0.15s ease",
              }}
            >
              <span>⚡</span>
              <span>Charge PKR {grandTotal.toLocaleString()} (Raast QR)</span>
            </button>

            {/* Secondary Standard Checkout Link */}
            <Link
              href="/checkout"
              style={{
                display: "block",
                textAlign: "center",
                marginTop: "10px",
                fontSize: "12px",
                fontWeight: 700,
                color: "#475569",
                textDecoration: "none",
              }}
            >
              Or proceed to Traditional Checkout →
            </Link>
          </div>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* UNIVERSAL RAAST EMVCo QR MODAL DIALOG                     */}
      {/* ======================================================== */}
      <AnimatePresence>
        {isQrModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
            }}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsQrModalOpen(false)}
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(15, 23, 42, 0.7)",
                backdropFilter: "blur(6px)",
              }}
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{
                position: "relative",
                background: "#ffffff",
                borderRadius: "24px",
                padding: "28px",
                width: "min(100%, 420px)",
                boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
                zIndex: 1,
                textAlign: "center",
              }}
            >
              <button
                type="button"
                onClick={() => setIsQrModalOpen(false)}
                style={{
                  position: "absolute",
                  top: "16px",
                  right: "16px",
                  border: "none",
                  background: "#f1f5f9",
                  borderRadius: "50%",
                  width: "32px",
                  height: "32px",
                  cursor: "pointer",
                  fontSize: "16px",
                }}
              >
                ✕
              </button>

              <div
                style={{
                  display: "inline-block",
                  padding: "4px 12px",
                  background: "#ecfdf5",
                  color: "#059669",
                  borderRadius: "9999px",
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: "0.5px",
                  marginBottom: "8px",
                }}
              >
                UNIVERSAL RAAST P2M PAY
              </div>

              <h3
                style={{
                  margin: "0 0 4px 0",
                  fontSize: "20px",
                  fontWeight: 800,
                  color: "#0f172a",
                  fontFamily: "Outfit, sans-serif",
                }}
              >
                Scan to Pay PKR {grandTotal.toLocaleString()}
              </h3>
              <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "#64748b" }}>
                Merchant: <strong>{RAAST_MERCHANT_NAME}</strong> · Ref:{" "}
                <strong>{RAAST_REF_NUMBER}</strong>
              </p>

              {/* QR Code Container */}
              <div
                style={{
                  display: "inline-block",
                  padding: "16px",
                  background: "#ffffff",
                  borderRadius: "20px",
                  border: "2px solid #e2e8f0",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
                }}
              >
                <QRCodeSVG
                  value={emvcoPayload}
                  size={210}
                  level="Q"
                  includeMargin={false}
                  imageSettings={{
                    src: "/icons/app-icon-192.png",
                    x: undefined,
                    y: undefined,
                    height: 38,
                    width: 38,
                    excavate: true,
                  }}
                />
              </div>

              <div
                style={{
                  marginTop: "16px",
                  padding: "10px 14px",
                  background: "#f8fafc",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  fontSize: "11px",
                  color: "#475569",
                  lineHeight: 1.5,
                }}
              >
                📱 Works with <strong>MCB Live</strong>, <strong>Easypaisa</strong>,{" "}
                <strong>JazzCash</strong>, <strong>SadaPay</strong>, <strong>NayaPay</strong> & all
                Raast banking apps.
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                <Link
                  href="/checkout"
                  style={{
                    flex: 1,
                    padding: "11px",
                    borderRadius: "12px",
                    background: "#059669",
                    color: "#ffffff",
                    fontSize: "12px",
                    fontWeight: 800,
                    textDecoration: "none",
                  }}
                >
                  Confirm & Place Order
                </Link>
                <button
                  type="button"
                  onClick={() => setIsQrModalOpen(false)}
                  style={{
                    padding: "11px 18px",
                    borderRadius: "12px",
                    background: "#f1f5f9",
                    color: "#334155",
                    fontSize: "12px",
                    fontWeight: 700,
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
