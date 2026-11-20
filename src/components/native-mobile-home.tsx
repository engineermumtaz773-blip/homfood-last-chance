"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import type { Dish } from "@/lib/data";
import { useLiveDishes } from "@/hooks/use-live-dishes";
import { useCart } from "@/components/cart-provider";
import { MobileDishModal } from "@/components/mobile-dish-modal";
import { readCustomerProfile, loadCustomerOrders, CUSTOMER_AUTH_EVENT, type CustomerProfile, type OrderRequest } from "@/lib/customer";
import { getFavoriteDishIds, toggleFavoriteDish, FAVORITES_CHANGE_EVENT } from "@/lib/favorites";
import { playAlertChime, broadcastRealtimeEvent } from "@/lib/realtime-bus";
import { REALTIME_SYNC_EVENT } from "@/lib/realtime-client";
import { useKitchenAvailability } from "@/hooks/use-kitchen-availability";
import { getLiveOrderStatus, type LiveOrderStatus } from "@/lib/order-api";
import type { OrderMessage } from "@/lib/supabase-server";

const CATEGORIES = [
  { id: "All", name: "All", icon: "🥘" },
  { id: "Breakfast", name: "Breakfast", icon: "🍳" },
  { id: "Lunch", name: "Lunch", icon: "🍱" },
  { id: "Dinner", name: "Dinner", icon: "🍛" },
  { id: "Rice & Biryani", name: "Rice & Biryani", icon: "🍚" },
  { id: "Home Specials", name: "Home Specials", icon: "🏠" },
  { id: "Daily Deals", name: "Daily Deals", icon: "🏷️" },
  { id: "BBQ & Karahi", name: "BBQ & Karahi", icon: "🍖" },
  { id: "Fast Food", name: "Fast Food", icon: "🍔" },
  { id: "Traditional", name: "Traditional", icon: "🍲" },
  { id: "Desserts & Drinks", name: "Desserts", icon: "🥤" },
  { id: "Favorites", name: "Favorites", icon: "❤️" },
];

const PROMOS = [
  {
    tag: "🔥 20% EXTRA OFF",
    title: "Homemade Feast Today",
    subtitle: "Piping hot, hygienic meals delivered to your doorstep",
    bg: "linear-gradient(135deg, #d70f64 0%, #b80d56 100%)", // Foodpanda Signature Pink
    action: "Order Now",
    filter: "All",
  },
  {
    tag: "🏷️ DAILY COMBOS",
    title: "Special Dinner & Lunch Deals",
    subtitle: "Complete portions with fresh raita & salad",
    bg: "linear-gradient(135deg, #ea580c 0%, #c2410c 100%)", // Warm Orange
    action: "View Deals",
    filter: "Daily Deals",
  },
  {
    tag: "🛵 FREE DELIVERY",
    title: "Across All Bahawalpur",
    subtitle: "On orders above PKR 1,500 with MCB Raast QR enabled",
    bg: "linear-gradient(135deg, #059669 0%, #047857 100%)", // Emerald
    action: "Browse Menu",
    filter: "All",
  },
];

const BAHAWALPUR_AREAS = [
  "Model Town A / B",
  "Satellite Town",
  "Cantt Area Bahawalpur",
  "One Unit Colony",
  "Dubai Chowk Area",
  "Islamia University Campus",
  "Cheema Town",
  "Medical Colony / B.V. Hospital",
  "Circular Road / City Center",
];

export function NativeMobileHome({ dishes: initialDishes }: { dishes: Dish[] }) {
  const liveCatalog = useLiveDishes(initialDishes);
  const kitchen = useKitchenAvailability();
  const { addItem } = useCart();

  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [activePromoIndex, setActivePromoIndex] = useState(0);
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [selectedArea, setSelectedArea] = useState("Model Town, Bahawalpur");
  const [isAreaPickerOpen, setIsAreaPickerOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  // Favorites state
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active customer orders
  const [activeOrder, setActiveOrder] = useState<OrderRequest | null>(null);

  // Filter options
  const [filterSort, setFilterSort] = useState<"popular" | "rating" | "price_low">("popular");
  const [filterPrice, setFilterPrice] = useState<"all" | "under_300" | "300_600" | "600_plus">("all");
  const [filterSpeed, setFilterSpeed] = useState<"all" | "fast">("all");
  const [filterRating, setFilterRating] = useState<"all" | "high">("all");

  // In-app order tracking & chat sheet state
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [liveOrderStatus, setLiveOrderStatus] = useState<LiveOrderStatus | null>(null);
  const [cancelCountdown, setCancelCountdown] = useState<number | null>(null);
  const [orderMessages, setOrderMessages] = useState<OrderMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [orderCancelReason, setOrderCancelReason] = useState("Placed by mistake");
  const activeOrderNumber = activeOrder?.number;
  const activeOrderPlacedAt = activeOrder?.placedAt;
  const liveOrderCreatedAt = liveOrderStatus?.created_at;
  const liveOrderStatusName = liveOrderStatus?.status;
  const canCancelByStatus = liveOrderStatusName === "new" || liveOrderStatusName === "confirmed";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setCustomer(readCustomerProfile());
      setFavoriteIds(getFavoriteDishIds());

      void loadCustomerOrders().then((recentOrders) => { if (recentOrders.length > 0) setActiveOrder(recentOrders[0]); }).catch((error: unknown) => console.error("Could not load mobile customer orders from Supabase.", error));
    });

    const onAuth = (e: Event) => {
      const ce = e as CustomEvent<CustomerProfile | null>;
      setCustomer(ce.detail || null);
    };

    const onFavChange = () => {
      setFavoriteIds(getFavoriteDishIds());
    };

    window.addEventListener(CUSTOMER_AUTH_EVENT, onAuth);
    window.addEventListener(FAVORITES_CHANGE_EVENT, onFavChange);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener(CUSTOMER_AUTH_EVENT, onAuth);
      window.removeEventListener(FAVORITES_CHANGE_EVENT, onFavChange);
    };
  }, []);

  // Promo auto-rotate
  useEffect(() => {
    const timer = setInterval(() => {
      setActivePromoIndex((prev) => (prev + 1) % PROMOS.length);
    }, 5500);
    return () => clearInterval(timer);
  }, []);

  // Fetch live order status & messages when active order is present
  useEffect(() => {
    if (!activeOrder) return;
    let active = true;

    async function fetchStatusAndMessages() {
      try {
        const status = await getLiveOrderStatus(activeOrder!.number, customer?.phone || "");
        if (active) setLiveOrderStatus(status);

        const res = await fetch(
          `/api/order-messages?number=${encodeURIComponent(activeOrder!.number)}&phone=${encodeURIComponent(customer?.phone || "")}`
        );
        if (res.ok) {
          const data = (await res.json()) as { messages?: OrderMessage[] };
          if (active && Array.isArray(data.messages)) {
            setOrderMessages(data.messages);
          }
        }
      } catch (err) {
        console.warn("Could not fetch active order status:", err);
      }
    }

    void fetchStatusAndMessages();
    const interval = setInterval(fetchStatusAndMessages, 4000);
    const onRealtimeSync = () => { void fetchStatusAndMessages(); };
    window.addEventListener(REALTIME_SYNC_EVENT, onRealtimeSync);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener(REALTIME_SYNC_EVENT, onRealtimeSync);
    };
  }, [activeOrder, customer?.phone, isTrackingModalOpen]);

  // Keep the mobile cancellation timer aligned with the server-enforced window.
  useEffect(() => {
    if (!activeOrderNumber || !liveOrderStatusName) {
      const frame = window.requestAnimationFrame(() => setCancelCountdown(null));
      return () => window.cancelAnimationFrame(frame);
    }
    if (!canCancelByStatus) {
      const frame = window.requestAnimationFrame(() => setCancelCountdown(null));
      return () => window.cancelAnimationFrame(frame);
    }
    const orderTime = new Date(
      liveOrderCreatedAt || activeOrderPlacedAt || Date.now()
    ).getTime();

    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - orderTime) / 1000);
      const remaining = Math.max(0, 300 - elapsed);
      setCancelCountdown(remaining);
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [activeOrderNumber, activeOrderPlacedAt, liveOrderCreatedAt, liveOrderStatusName, canCancelByStatus]);

  // In-app order cancellation handler
  const handleCancelActiveOrder = async () => {
    if (!activeOrder || cancellingOrder) return;
    setCancellingOrder(true);
    try {
      const res = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: activeOrder.number,
          phone: customer?.phone || "",
          reason: orderCancelReason,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setLiveOrderStatus((prev) => (prev ? { ...prev, status: "cancelled" } : null));
        setShowCancelPrompt(false);
        playAlertChime("alert");
        broadcastRealtimeEvent({
          type: "order_cancelled",
          orderNumber: activeOrder.number,
          message: `Customer cancelled order ${activeOrder.number}: "${orderCancelReason}"`,
        });
        setToastMessage(`Order ${activeOrder.number} has been cancelled.`);
      } else {
        throw new Error(data.error || "Cancellation failed");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel order.");
    } finally {
      setCancellingOrder(false);
    }
  };

  // In-app user-to-admin chat message send
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatDraft.trim();
    if (!activeOrder || !text || chatSending) return;
    setChatSending(true);
    try {
      const res = await fetch("/api/order-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: activeOrder.number,
          phone: customer?.phone || "",
          sender: "customer",
          body: text,
        }),
      });
      const data = await res.json() as { message?: OrderMessage; warnings?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error || `Message could not be sent (HTTP ${res.status}).`);
      if (data.message) {
        setOrderMessages((prev) => [...prev, data.message as OrderMessage]);
        playAlertChime("pop");
        broadcastRealtimeEvent({
          type: "chat_message",
          orderNumber: activeOrder.number,
          message: text,
        });
      }
      setChatDraft("");
      setToastMessage(data.warnings?.[0] || "Message sent to the kitchen.");
      window.setTimeout(() => setToastMessage(null), 2500);
    } catch (err) {
      console.error("Failed to send order message:", err);
      setToastMessage(err instanceof Error ? err.message : "Message could not be sent.");
      window.setTimeout(() => setToastMessage(null), 3500);
    } finally {
      setChatSending(false);
    }
  };

  const handleToggleFavorite = (dishId: number, dishName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isNowFav = toggleFavoriteDish(dishId);
    playAlertChime("pop");
    setToastMessage(isNowFav ? `❤️ Added "${dishName}" to Favorites!` : `Removed "${dishName}" from Favorites`);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleQuickAddToCart = (dish: Dish, e: React.MouseEvent) => {
    e.stopPropagation();
    const portion = dish.portions?.[0] || { name: "Standard", price: 250 };
    addItem({
      id: dish.id,
      name: dish.name,
      portion: portion.name,
      price: portion.price,
      quantity: 1,
    });
    playAlertChime("success");
    setToastMessage(`🛍️ Added ${dish.name} (PKR ${portion.price}) to bag!`);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const filteredDishes = useMemo(() => {
    return liveCatalog.dishes
      .filter((dish) => {
        // Category filtering
        let matchesCategory = true;
        const normalizedCategory = selectedCategory.trim().toLocaleLowerCase();
        if (normalizedCategory === "favorites") {
          matchesCategory = favoriteIds.includes(dish.id);
        } else if (normalizedCategory === "daily deals") {
          matchesCategory =
            [dish.category, ...(dish.categories || [])].some((category) => category.trim().toLocaleLowerCase().includes("deal")) ||
            Boolean(dish.dietaryTags && dish.dietaryTags.some((tag) => tag.trim().toLocaleLowerCase().includes("deal")));
        } else if (normalizedCategory === "bbq & karahi") {
          const categories = [dish.category, ...(dish.categories || [])].map((category) => category.trim().toLowerCase());
          matchesCategory =
            categories.some((category) => category.includes("karahi") || category.includes("bbq")) ||
            dish.name.toLowerCase().includes("karahi") ||
            dish.name.toLowerCase().includes("tikka");
        } else if (normalizedCategory !== "all") {
          const category = normalizedCategory;
          matchesCategory = [dish.category, ...(dish.categories || [])]
            .some((value) => value.trim().toLowerCase() === category);
        }

        // Search query
        const query = searchQuery.trim().toLowerCase();
        const matchesSearch =
          !query ||
          dish.name.toLowerCase().includes(query) ||
          dish.description.toLowerCase().includes(query) ||
          [dish.category, ...(dish.categories || [])].some((category) => category.toLowerCase().includes(query));

        // Price filter
        const price = dish.portions?.[0]?.price || 0;
        let matchesPrice = true;
        if (filterPrice === "under_300") matchesPrice = price < 300;
        else if (filterPrice === "300_600") matchesPrice = price >= 300 && price <= 600;
        else if (filterPrice === "600_plus") matchesPrice = price > 600;

        // Speed filter (< 30 min)
        let matchesSpeed = true;
        if (filterSpeed === "fast") {
          matchesSpeed =
            dish.category.toLowerCase().includes("fast") ||
            Boolean(dish.dietaryTags && dish.dietaryTags.some((t) => t.toLowerCase().includes("fast") || t.toLowerCase().includes("quick")));
        }

        // Rating filter (4.8+ rating)
        let matchesRating = true;
        if (filterRating === "high") {
          matchesRating = (dish.rating || 4.9) >= 4.8;
        }

        return matchesCategory && matchesSearch && matchesPrice && matchesSpeed && matchesRating;
      })
      .sort((a, b) => {
        if (filterSort === "price_low") {
          const pa = a.portions?.[0]?.price || 0;
          const pb = b.portions?.[0]?.price || 0;
          return pa - pb;
        }
        if (filterSort === "rating") {
          return (b.rating || 4.9) - (a.rating || 4.9);
        }
        return 0; // Default order
      });
  }, [liveCatalog.dishes, selectedCategory, searchQuery, favoriteIds, filterPrice, filterSort, filterSpeed, filterRating]);

  const handleOpenDish = (dish: Dish) => {
    setSelectedDish(dish);
    setIsModalOpen(true);
  };

  const activeFiltersCount =
    (filterPrice !== "all" ? 1 : 0) +
    (filterSort !== "popular" ? 1 : 0) +
    (filterSpeed !== "all" ? 1 : 0) +
    (filterRating !== "all" ? 1 : 0);

  return (
    <MotionConfig reducedMotion="user">
    <div
      className="foodpanda-mobile-root"
      style={{
        background: "#f8fafc",
        minHeight: "100dvh",
        width: "100%",
        maxWidth: "1440px",
        marginInline: "auto",
        paddingBottom: "calc(80px + env(safe-area-inset-bottom))",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      {kitchen && !kitchen.available && (
        <div role="alert" style={{ display: "grid", gap: 4, padding: "10px 14px", background: "#fff7ed", borderBottom: "1px solid #fed7aa", color: "#9a3412", fontSize: 12 }}>
          <strong>Online orders are paused</strong>
          <span>{kitchen.reason}{kitchen.schedule ? ` · ${kitchen.schedule}` : ""}</span>
        </div>
      )}
      {/* Toast Alert */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            style={{
              position: "fixed",
              top: 70,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 99999,
              background: "#0f172a",
              color: "#fff",
              padding: "10px 18px",
              borderRadius: "30px",
              fontSize: "13px",
              fontWeight: 700,
              boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              whiteSpace: "nowrap",
            }}
          >
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1. TOP LOCATION & SEARCH ROW (Foodpanda Visual Hierarchy) */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 45,
          background: "#ffffff",
          padding: "calc(10px + env(safe-area-inset-top, 0px)) 16px 12px",
          borderBottom: "1px solid #f1f5f9",
          boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
        }}
      >
        {/* Row 1: Delivery Location & Wishlist Shortcut */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "10px",
          }}
        >
          {/* Location Selector */}
          <button
            className="native-home-location"
            type="button"
            onClick={() => setIsAreaPickerOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "10px",
                background: "#fdf2f8", // Soft Rose
                color: "#d70f64", // Foodpanda Signature
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                flexShrink: 0,
              }}
            >
              📍
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 700 }}>
                Delivering to
              </div>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 800,
                  color: "#0f172a",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span>{selectedArea}</span>
                <span style={{ fontSize: "10px", color: "#d70f64" }}>▼</span>
              </div>
            </div>
          </button>

          {/* Right Header Actions: Favorites & Customer Profile Avatar */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setSelectedCategory(selectedCategory === "Favorites" ? "All" : "Favorites")}
              style={{
                position: "relative",
                padding: "6px 12px",
                borderRadius: "20px",
                background: selectedCategory === "Favorites" ? "#fdf2f8" : "#f8fafc",
                border: selectedCategory === "Favorites" ? "1.5px solid #d70f64" : "1px solid #e2e8f0",
                color: selectedCategory === "Favorites" ? "#d70f64" : "#475569",
                fontSize: "12px",
                fontWeight: 800,
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                cursor: "pointer",
              }}
            >
              <span>❤️</span>
              <span>{favoriteIds.length}</span>
            </button>

            {/* User Profile Avatar / Sign In Shortcut */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                if (customer?.emailVerified) {
                  window.location.href = "/profile";
                } else {
                  window.dispatchEvent(
                    new CustomEvent("hmf_open_auth_modal", {
                      detail: {
                        mode: "login",
                        reason: "Sign in to access your saved profile and live order tracking.",
                      },
                    })
                  );
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 10px 4px 4px",
                borderRadius: "20px",
                background: customer?.emailVerified ? "#ecfdf5" : "#f8fafc",
                border: customer?.emailVerified ? "1px solid #a7f3d0" : "1px solid #e2e8f0",
                cursor: "pointer",
              }}
            >
              {customer?.avatarUrl ? (
                <img
                  src={customer.avatarUrl}
                  alt={customer.name || "Customer"}
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "1.5px solid #10b981",
                    boxShadow: "0 0 6px rgba(16, 185, 129, 0.4)",
                  }}
                />
              ) : (
                <span
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    background: "#173f2b",
                    color: "#ffffff",
                    display: "grid",
                    placeItems: "center",
                    fontSize: "11px",
                    fontWeight: 800,
                  }}
                >
                  {customer?.name ? customer.name.charAt(0).toUpperCase() : "👤"}
                </span>
              )}
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 800,
                  color: customer?.emailVerified ? "#065f46" : "#475569",
                  maxWidth: "54px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {customer?.name ? customer.name.split(" ")[0] : "Sign In"}
              </span>
            </motion.button>
          </div>
        </div>

        {/* Row 2: Foodpanda Search Input & Filter Button */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <div
            style={{
              position: "relative",
              flex: 1,
              display: "flex",
              alignItems: "center",
            }}
          >
            <span
              style={{
                position: "absolute",
                left: "12px",
                color: "#94a3b8",
                fontSize: "15px",
                pointerEvents: "none",
              }}
            >
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dishes, karahi, biryani..."
              style={{
                width: "100%",
                padding: "9px 36px 9px 36px",
                borderRadius: "12px",
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                fontSize: "13px",
                fontWeight: 600,
                color: "#0f172a",
                outline: "none",
              }}
            />
            {searchQuery && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: "10px",
                  background: "#cbd5e1",
                  border: "none",
                  borderRadius: "50%",
                  width: "18px",
                  height: "18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: "10px",
                  cursor: "pointer",
                }}
              >
                ✕
              </motion.button>
            )}
          </div>

          {/* Filter Trigger Button */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => setIsFilterModalOpen(true)}
            style={{
              position: "relative",
              padding: "9px 12px",
              borderRadius: "12px",
              background: activeFiltersCount > 0 ? "#fdf2f8" : "#ffffff",
              border: activeFiltersCount > 0 ? "1.5px solid #d70f64" : "1px solid #cbd5e1",
              color: activeFiltersCount > 0 ? "#d70f64" : "#475569",
              fontSize: "12px",
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>⚙️</span>
            <span>Filter</span>
            {activeFiltersCount > 0 && (
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "#d70f64",
                }}
              />
            )}
          </motion.button>
        </div>
      </div>

      {/* 2. ACTIVE ORDER TRACKER BANNER (If customer has placed an order or wants to demo) */}
      {activeOrder ? (
        <div style={{ padding: "10px 16px 0" }}>
          <button
            type="button"
            onClick={() => setIsTrackingModalOpen(true)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderRadius: "14px",
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              color: "#ffffff",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
              textAlign: "left",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "20px", animation: "bounce 2s infinite" }}>🛵</span>
              <div>
                <strong style={{ display: "block", fontSize: "13px", lineHeight: 1.1 }}>
                  Order #{activeOrder.number} {liveOrderStatus?.status ? `(${liveOrderStatus.status.toUpperCase()})` : "IN PROGRESS"}
                </strong>
                <small style={{ fontSize: "11px", opacity: 0.9 }}>
                  Cooking in Kitchen · Tap for Live Map, Rider & Chat ➔
                </small>
              </div>
            </div>
            <span style={{ fontSize: "14px", fontWeight: 800 }}>➔</span>
          </button>
        </div>
      ) : (
        <div style={{ padding: "10px 16px 0" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              borderRadius: "12px",
              background: "#f0fdf4",
              border: "1px dashed #86efac",
              fontSize: "12px",
              color: "#166534",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span>🛵</span>
              <span>Track an existing order or test live tracker</span>
            </div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                const demoOrder = {
                  number: "HMF-ORD-" + Math.floor(1000 + Math.random() * 9000),
                  placedAt: new Date().toISOString(),
                };
                setActiveOrder({
                  ...demoOrder,
                  total: 0,
                  payment: "Cash on Delivery",
                  items: "Demo order",
                  status: "new",
                });
                setLiveOrderStatus({
                  number: demoOrder.number,
                  total: 0,
                  status: "new",
                  created_at: demoOrder.placedAt,
                  updated_at: demoOrder.placedAt,
                  items: [],
                  subtotal: 0,
                  discount: 0,
                  deliveryFee: 0,
                  paymentMethod: "Cash on Delivery",
                });
                setIsTrackingModalOpen(true);
              }}
              style={{
                background: "#16a34a",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "4px 10px",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Test Tracker
            </motion.button>
          </div>
        </div>
      )}

      {/* 3. HERO PROMOTIONAL BANNER CAROUSEL (Foodpanda Style) */}
      <section style={{ padding: "14px 16px 8px" }}>
        <motion.div
          key={activePromoIndex}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35 }}
          style={{
            position: "relative",
            borderRadius: "20px",
            overflow: "hidden",
            background: PROMOS[activePromoIndex].bg,
            color: "#ffffff",
            padding: "18px 20px",
            boxShadow: "0 10px 25px rgba(215, 15, 100, 0.25), 0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ maxWidth: "75%" }}>
            <span
              style={{
                display: "inline-block",
                background: "rgba(255,255,255,0.25)",
                backdropFilter: "blur(4px)",
                padding: "4px 10px",
                borderRadius: "9999px",
                fontSize: "10px",
                fontWeight: 800,
                letterSpacing: "0.5px",
                marginBottom: "8px",
              }}
            >
              {PROMOS[activePromoIndex].tag}
            </span>
            <h2
              style={{
                margin: "0 0 6px 0",
                fontSize: "18px",
                fontWeight: 800,
                lineHeight: 1.25,
              }}
            >
              {PROMOS[activePromoIndex].title}
            </h2>
            <p
              style={{
                margin: "0 0 12px 0",
                fontSize: "12px",
                opacity: 0.92,
                lineHeight: 1.4,
              }}
            >
              {PROMOS[activePromoIndex].subtitle}
            </p>
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => setSelectedCategory(PROMOS[activePromoIndex].filter)}
              style={{
                background: "#ffffff",
                color: "#0f172a",
                border: "none",
                padding: "7px 16px",
                borderRadius: "10px",
                fontSize: "12px",
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}
            >
              {PROMOS[activePromoIndex].action} ➔
            </motion.button>
          </div>

          <div
            style={{
              position: "absolute",
              right: "-10px",
              bottom: "-10px",
              fontSize: "76px",
              opacity: 0.3,
              transform: "rotate(-15deg)",
              pointerEvents: "none",
            }}
          >
            🍲
          </div>

          {/* Dots Indicator */}
          <div
            style={{
              display: "flex",
              gap: "4px",
              position: "absolute",
              bottom: "12px",
              right: "14px",
            }}
          >
            {PROMOS.map((_, i) => (
              <div
                key={i}
                style={{
                  width: activePromoIndex === i ? "16px" : "6px",
                  height: "6px",
                  borderRadius: "9999px",
                  background: activePromoIndex === i ? "#ffffff" : "rgba(255,255,255,0.4)",
                  transition: "all 0.25s ease",
                }}
              />
            ))}
          </div>
        </motion.div>
      </section>

      {/* 4. FOODPANDA CATEGORY PILLS (Horizontal Scroll Carousel with 3D Pop) */}
      <section style={{ padding: "8px 0 12px" }}>
        <div
          style={{
            display: "flex",
            gap: "8px",
            overflowX: "auto",
            padding: "4px 16px",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <motion.button
                key={cat.id}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.94 }}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                aria-pressed={isSelected}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  borderRadius: "9999px",
                  border: isSelected ? "1px solid transparent" : "1px solid #e2e8f0",
                  background: "transparent",
                  color: isSelected ? "#ffffff" : "#475569",
                  fontWeight: isSelected ? 800 : 600,
                  fontSize: "12px",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.03)",
                  flexShrink: 0,
                  transition: "all 0.2s ease",
                }}
              >
                {isSelected && <motion.span layoutId="native-category-active" className="native-category-active" />}
                <span style={{ position: "relative", zIndex: 1, fontSize: "14px" }}>{cat.icon}</span>
                <span style={{ position: "relative", zIndex: 1 }}>{cat.name}</span>
                {cat.id === "Favorites" && favoriteIds.length > 0 && (
                  <span
                    style={{
                      position: "relative",
                      zIndex: 1,
                      background: isSelected ? "#ffffff" : "#d70f64",
                      color: isSelected ? "#d70f64" : "#ffffff",
                      borderRadius: "50%",
                      width: "16px",
                      height: "16px",
                      fontSize: "10px",
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 800,
                    }}
                  >
                    {favoriteIds.length}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* 5. FOOD CATALOG HEADING */}
      <section
        style={{
          padding: "8px 16px 10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>
            {selectedCategory === "All"
              ? "Popular Homemade Dishes"
              : selectedCategory === "Favorites"
              ? "Your Saved Favorites ❤️"
              : selectedCategory}
          </h2>
          <span style={{ fontSize: "11px", color: "#64748b" }}>
            {filteredDishes.length} fresh homemade dishes available
          </span>
        </div>
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            style={{
              background: "none",
              border: "none",
              color: "#d70f64",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Clear Search
          </button>
        )}
      </section>

      {/* 6. 2-COLUMN SIGNATURE DISHES GRID WITH 3D CARD DEPTH */}
      <section style={{ padding: "0 16px" }}>
        {liveCatalog.loading && liveCatalog.dishes.length === 0 ? (
          <div className="native-home-dish-grid" aria-label="Loading dishes">
            {Array.from({ length: 4 }, (_, index) => (
              <motion.div
                key={`dish-skeleton-${index}`}
                className="native-home-dish-skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.06 }}
              />
            ))}
          </div>
        ) : filteredDishes.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px 20px",
              background: "#ffffff",
              borderRadius: "18px",
              border: "1px dashed #cbd5e1",
            }}
          >
            <div style={{ fontSize: "40px", marginBottom: "10px" }}>🍽️</div>
            <h3 style={{ margin: "0 0 6px 0", fontSize: "15px", fontWeight: 700 }}>
              No dishes found
            </h3>
            <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
              Try searching for something else or reset filters.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory("All");
                setSearchQuery("");
                setFilterSort("popular");
                setFilterPrice("all");
                setFilterSpeed("all");
                setFilterRating("all");
              }}
              style={{
                marginTop: "14px",
                padding: "8px 18px",
                borderRadius: "10px",
                background: "#d70f64",
                color: "#ffffff",
                border: "none",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div
            className="native-home-dish-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "12px",
            }}
          >
            {filteredDishes.map((dish, index) => {
              const portion = dish.portions?.[0] || { name: "Standard", price: 250 };
              const available = dish.available !== false;
              const isFav = favoriteIds.includes(dish.id);

              return (
                <motion.div
                  key={dish.id}
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: available ? 1 : 0.65, y: 0 }}
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.24, delay: Math.min(index * 0.025, 0.3) }}
                  className="native-home-dish-card"
                  onClick={() => available && handleOpenDish(dish)}
                  style={{
                    background: "#ffffff",
                    borderRadius: "18px",
                    overflow: "hidden",
                    border: "1px solid #f1f5f9",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.03)",
                    display: "flex",
                    flexDirection: "column",
                    position: "relative",
                    cursor: available ? "pointer" : "default",
                    opacity: available ? 1 : 0.65,
                    transform: "translateZ(0)",
                  }}
                >
                  {/* Dish Thumbnail */}
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      paddingTop: "75%", // 4:3 Aspect Ratio
                      background: "#f1f5f9",
                      overflow: "hidden",
                    }}
                  >
                    {dish.imageUrl ? (
                      <Image
                        src={dish.imageUrl}
                        alt={dish.name}
                        fill
                        sizes="(max-width: 600px) 50vw, 300px"
                        unoptimized
                        style={{ objectFit: "cover" }}
                      />
                    ) : (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "36px",
                        }}
                      >
                        🍲
                      </div>
                    )}

                    {/* Foodpanda Discount Tag */}
                    <div
                      style={{
                        position: "absolute",
                        top: "8px",
                        left: "8px",
                        background: "#d70f64",
                        color: "#ffffff",
                        padding: "2px 7px",
                        borderRadius: "6px",
                        fontSize: "9px",
                        fontWeight: 800,
                        boxShadow: "0 2px 6px rgba(215, 15, 100, 0.4)",
                      }}
                    >
                      🔥 15% OFF
                    </div>

                    {/* Heart Wishlist Button */}
                    <button
                      type="button"
                      onClick={(e) => handleToggleFavorite(dish.id, dish.name, e)}
                      style={{
                        position: "absolute",
                        top: "8px",
                        right: "8px",
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        background: "rgba(255, 255, 255, 0.9)",
                        border: "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "14px",
                        cursor: "pointer",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                      }}
                    >
                      {isFav ? "❤️" : "🤍"}
                    </button>

                    {/* Delivery Duration Badge */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: "6px",
                        left: "8px",
                        background: "rgba(15, 23, 42, 0.8)",
                        backdropFilter: "blur(4px)",
                        color: "#ffffff",
                        padding: "2px 6px",
                        borderRadius: "6px",
                        fontSize: "9px",
                        fontWeight: 700,
                      }}
                    >
                      ⏱️ 25-35 min
                    </div>
                  </div>

                  {/* Card Content */}
                  <div
                    style={{
                      padding: "10px 10px 12px",
                      display: "flex",
                      flexDirection: "column",
                      flex: 1,
                    }}
                  >
                    {/* Rating */}
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "4px" }}>
                      <span style={{ fontSize: "11px", color: "#f59e0b" }}>★</span>
                      <span style={{ fontSize: "11px", fontWeight: 800, color: "#1e293b" }}>4.9</span>
                      <span style={{ fontSize: "10px", color: "#94a3b8" }}>(80+)</span>
                    </div>

                    {/* Dish Name */}
                    <h3
                      style={{
                        margin: "0 0 4px 0",
                        fontSize: "13px",
                        fontWeight: 800,
                        color: "#0f172a",
                        lineHeight: 1.25,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {dish.name}
                    </h3>

                    {/* Price & Add Button */}
                    <div
                      style={{
                        marginTop: "auto",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingTop: "6px",
                      }}
                    >
                      <div>
                        <span style={{ fontSize: "10px", color: "#64748b", display: "block" }}>
                          {portion.name}
                        </span>
                        <strong style={{ fontSize: "13px", color: "#0f172a", fontWeight: 800 }}>
                          PKR {portion.price.toLocaleString()}
                        </strong>
                      </div>

                      {/* Instant Add-to-Cart Button (+) */}
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.88 }}
                        onClick={(e) => handleQuickAddToCart(dish, e)}
                        disabled={!available}
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "10px",
                          background: available ? "linear-gradient(135deg, #d70f64 0%, #b80d56 100%)" : "#cbd5e1",
                          color: "#ffffff",
                          border: "none",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "18px",
                          fontWeight: 800,
                          cursor: available ? "pointer" : "default",
                          boxShadow: available ? "0 4px 10px rgba(215, 15, 100, 0.35)" : "none",
                        }}
                      >
                        +
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {/* 7. SEARCH & MULTI-FILTER MODAL */}
      <AnimatePresence>
        {isFilterModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99999,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
            }}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFilterModalOpen(false)}
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(15, 23, 42, 0.6)",
                backdropFilter: "blur(4px)",
              }}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              style={{
                position: "relative",
                background: "#ffffff",
                borderTopLeftRadius: "24px",
                borderTopRightRadius: "24px",
                padding: "20px 20px 28px",
                zIndex: 1,
                maxHeight: "80vh",
                overflowY: "auto",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 800 }}>Sort & Filter</h3>
                <button
                  type="button"
                  onClick={() => setIsFilterModalOpen(false)}
                  style={{ background: "#f1f5f9", border: "none", borderRadius: "50%", width: "30px", height: "30px", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>

              {/* Sort By */}
              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#475569", marginBottom: "8px" }}>
                  Sort By
                </label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {[
                    { id: "popular", label: "Popular" },
                    { id: "rating", label: "Highest Rated" },
                    { id: "price_low", label: "Price: Low to High" },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setFilterSort(s.id as "popular" | "rating" | "price_low")}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "10px",
                        border: filterSort === s.id ? "1.5px solid #d70f64" : "1px solid #cbd5e1",
                        background: filterSort === s.id ? "#fdf2f8" : "#ffffff",
                        color: filterSort === s.id ? "#d70f64" : "#334155",
                        fontWeight: 700,
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Range */}
              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#475569", marginBottom: "8px" }}>
                  Price Range
                </label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {[
                    { id: "all", label: "All Prices" },
                    { id: "under_300", label: "Under PKR 300" },
                    { id: "300_600", label: "PKR 300 - 600" },
                    { id: "600_plus", label: "PKR 600+" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setFilterPrice(p.id as "all" | "under_300" | "300_600" | "600_plus")}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "10px",
                        border: filterPrice === p.id ? "1.5px solid #d70f64" : "1px solid #cbd5e1",
                        background: filterPrice === p.id ? "#fdf2f8" : "#ffffff",
                        color: filterPrice === p.id ? "#d70f64" : "#334155",
                        fontWeight: 700,
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Delivery Speed */}
              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#475569", marginBottom: "8px" }}>
                  Delivery Speed
                </label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {[
                    { id: "all", label: "Any Speed" },
                    { id: "fast", label: "⚡ Express Fast (<30 min)" },
                  ].map((spd) => (
                    <button
                      key={spd.id}
                      type="button"
                      onClick={() => setFilterSpeed(spd.id as "all" | "fast")}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "10px",
                        border: filterSpeed === spd.id ? "1.5px solid #d70f64" : "1px solid #cbd5e1",
                        background: filterSpeed === spd.id ? "#fdf2f8" : "#ffffff",
                        color: filterSpeed === spd.id ? "#d70f64" : "#334155",
                        fontWeight: 700,
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      {spd.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dish Rating */}
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 800, color: "#475569", marginBottom: "8px" }}>
                  Customer Rating
                </label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {[
                    { id: "all", label: "All Ratings" },
                    { id: "high", label: "⭐ Top Rated (4.8+ Stars)" },
                  ].map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setFilterRating(r.id as "all" | "high")}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "10px",
                        border: filterRating === r.id ? "1.5px solid #d70f64" : "1px solid #cbd5e1",
                        background: filterRating === r.id ? "#fdf2f8" : "#ffffff",
                        color: filterRating === r.id ? "#d70f64" : "#334155",
                        fontWeight: 700,
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Apply & Reset Buttons */}
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setIsFilterModalOpen(false)}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "12px",
                    background: "#d70f64",
                    color: "#ffffff",
                    border: "none",
                    fontWeight: 800,
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  Apply Filters
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilterSort("popular");
                    setFilterPrice("all");
                    setFilterSpeed("all");
                    setFilterRating("all");
                    setIsFilterModalOpen(false);
                  }}
                  style={{
                    padding: "12px 18px",
                    borderRadius: "12px",
                    background: "#f1f5f9",
                    color: "#475569",
                    border: "none",
                    fontWeight: 700,
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  Reset
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 8. DELIVERY AREA PICKER SHEET */}
      <AnimatePresence>
        {isAreaPickerOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99998,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
            }}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAreaPickerOpen(false)}
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(15, 23, 42, 0.6)",
                backdropFilter: "blur(4px)",
              }}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              style={{
                position: "relative",
                background: "#ffffff",
                borderTopLeftRadius: "24px",
                borderTopRightRadius: "24px",
                padding: "20px",
                zIndex: 1,
                maxHeight: "70vh",
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>
                    Select Delivery Area
                  </h3>
                  <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
                    Bahawalpur coverage zones
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAreaPickerOpen(false)}
                  style={{
                    background: "#f1f5f9",
                    border: "none",
                    borderRadius: "50%",
                    width: "30px",
                    height: "30px",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {BAHAWALPUR_AREAS.map((area) => (
                  <button
                    key={area}
                    type="button"
                    onClick={() => {
                      setSelectedArea(area);
                      setIsAreaPickerOpen(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      border: selectedArea === area ? "1.5px solid #d70f64" : "1px solid #e2e8f0",
                      background: selectedArea === area ? "#fdf2f8" : "#ffffff",
                      color: selectedArea === area ? "#d70f64" : "#1e293b",
                      fontWeight: selectedArea === area ? 700 : 500,
                      fontSize: "13px",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <span>📍</span>
                    <span>{area}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 9. DISH CUSTOMIZATION MODAL */}
      <MobileDishModal
        dish={selectedDish}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      {/* 10. IN-APP REAL-TIME ORDER TRACKER & KITCHEN CHAT BOTTOM SHEET */}
      <AnimatePresence>
        {isTrackingModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99999,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
            }}
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsTrackingModalOpen(false)}
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(15, 23, 42, 0.7)",
                backdropFilter: "blur(6px)",
              }}
            />

            {/* Bottom Sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              style={{
                position: "relative",
                background: "#ffffff",
                borderTopLeftRadius: "26px",
                borderTopRightRadius: "26px",
                padding: "20px 18px 28px",
                zIndex: 1,
                maxHeight: "88vh",
                overflowY: "auto",
                boxShadow: "0 -10px 40px rgba(0,0,0,0.25)",
              }}
            >
              {/* Drag Pill Handle */}
              <div
                style={{
                  width: "44px",
                  height: "5px",
                  borderRadius: "999px",
                  background: "#cbd5e1",
                  margin: "0 auto 16px",
                }}
              />

              {/* Sheet Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "14px",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "20px" }}>🛵</span>
                    <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 900, color: "#0f172a" }}>
                      Live Order Tracking
                    </h3>
                  </div>
                  <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>
                    Order #{activeOrder?.number || "HMF-ACTIVE"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTrackingModalOpen(false)}
                  style={{
                    background: "#f1f5f9",
                    border: "none",
                    borderRadius: "50%",
                    width: "32px",
                    height: "32px",
                    fontSize: "14px",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    color: "#475569",
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Stepper Status Indicators */}
              {(() => {
                const st = liveOrderStatus?.status || "confirmed";
                const isCancelled = st === "cancelled";
                let activeStep = 0;
                if (st === "preparing") activeStep = 1;
                else if (st === "arriving") activeStep = 2;
                else if (st === "completed") activeStep = 3;

                const steps = [
                  { title: "Received", icon: "📋", desc: "Sent to Kitchen" },
                  { title: "Cooking", icon: "🍳", desc: "Fresh Prep" },
                  { title: "On The Way", icon: "🛵", desc: "Rider En Route" },
                  { title: "Delivered", icon: "✅", desc: "Enjoy your meal" },
                ];

                if (isCancelled) {
                  return (
                    <div
                      style={{
                        padding: "12px 14px",
                        borderRadius: "14px",
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        marginBottom: "16px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <span style={{ fontSize: "24px" }}>❌</span>
                      <div>
                        <strong style={{ display: "block", fontSize: "13px", color: "#991b1b" }}>
                          Order Cancelled
                        </strong>
                        <span style={{ fontSize: "11px", color: "#b91c1c" }}>
                          This order has been cancelled and reported to the admin panel.
                        </span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    style={{
                      background: "#f8fafc",
                      borderRadius: "16px",
                      padding: "14px 12px",
                      marginBottom: "16px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        position: "relative",
                        textAlign: "center",
                      }}
                    >
                      {/* Connecting Line */}
                      <div
                        style={{
                          position: "absolute",
                          top: "16px",
                          left: "12%",
                          right: "12%",
                          height: "3px",
                          background: "#e2e8f0",
                          zIndex: 0,
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${(activeStep / 3) * 100}%`,
                            background: "linear-gradient(90deg, #10b981 0%, #059669 100%)",
                            transition: "width 0.4s ease",
                          }}
                        />
                      </div>

                      {steps.map((s, idx) => {
                        const isDone = idx < activeStep;
                        const isCurrent = idx === activeStep;
                        return (
                          <div
                            key={idx}
                            style={{
                              position: "relative",
                              zIndex: 1,
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                            }}
                          >
                            <div
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "50%",
                                background: isCurrent
                                  ? "#10b981"
                                  : isDone
                                  ? "#059669"
                                  : "#ffffff",
                                color: isCurrent || isDone ? "#ffffff" : "#94a3b8",
                                border: isCurrent
                                  ? "3px solid #bbf7d0"
                                  : isDone
                                  ? "2px solid #059669"
                                  : "2px solid #cbd5e1",
                                display: "grid",
                                placeItems: "center",
                                fontSize: "14px",
                                fontWeight: 800,
                                marginBottom: "6px",
                                boxShadow: isCurrent
                                  ? "0 0 12px rgba(16, 185, 129, 0.45)"
                                  : "none",
                              }}
                            >
                              {s.icon}
                            </div>
                            <strong
                              style={{
                                fontSize: "11px",
                                color: isCurrent ? "#059669" : isDone ? "#1e293b" : "#94a3b8",
                                fontWeight: isCurrent ? 800 : 600,
                              }}
                            >
                              {s.title}
                            </strong>
                            <small
                              style={{
                                fontSize: "9px",
                                color: "#64748b",
                                display: "none",
                              }}
                            >
                              {s.desc}
                            </small>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Live Map Display */}
              <div
                style={{
                  position: "relative",
                  borderRadius: "16px",
                  overflow: "hidden",
                  border: "1px solid #e2e8f0",
                  marginBottom: "14px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
                }}
              >
                <iframe
                  title="Live Delivery Map"
                  src="https://www.openstreetmap.org/export/embed.html?bbox=71.6400%2C29.3700%2C71.7400%2C29.4300&layer=mapnik&marker=29.3957%2C71.6833"
                  style={{
                    width: "100%",
                    height: "170px",
                    border: "none",
                    display: "block",
                    filter: "contrast(1.02)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: "10px",
                    left: "10px",
                    right: "10px",
                    background: "rgba(255, 255, 255, 0.96)",
                    backdropFilter: "blur(8px)",
                    padding: "8px 12px",
                    borderRadius: "12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "#10b981",
                        boxShadow: "0 0 8px #10b981",
                      }}
                    />
                    <strong style={{ fontSize: "11px", color: "#1e293b" }}>
                      Bahawalpur Zone: Live Rider Dispatch
                    </strong>
                  </div>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 800,
                      color: "#d70f64",
                    }}
                  >
                    Est. 20-30 min
                  </span>
                </div>
              </div>

              {/* Rider Info Card with Instant Call / WhatsApp Actions */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  borderRadius: "14px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  marginBottom: "14px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      background: "#e0f2fe",
                      display: "grid",
                      placeItems: "center",
                      fontSize: "20px",
                    }}
                  >
                    🛵
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 800, color: "#0f172a" }}>
                      Mumtaz Express Delivery
                    </h4>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>
                      Assigned Rider · Honda 125 (BWP-8492)
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <a
                    href="tel:03096648932"
                    style={{
                      padding: "8px 12px",
                      borderRadius: "10px",
                      background: "#10b981",
                      color: "#ffffff",
                      textDecoration: "none",
                      fontSize: "12px",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      boxShadow: "0 2px 6px rgba(16, 185, 129, 0.3)",
                    }}
                  >
                    <span>📞</span> Call
                  </a>
                  <a
                    href={`https://wa.me/923096648932?text=${encodeURIComponent(
                      `Assalam-o-Alaikum, regarding my Home Made Food order #${activeOrder?.number || ""}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: "8px 12px",
                      borderRadius: "10px",
                      background: "#25d366",
                      color: "#ffffff",
                      textDecoration: "none",
                      fontSize: "12px",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      boxShadow: "0 2px 6px rgba(37, 211, 102, 0.3)",
                    }}
                  >
                    <span>💬</span> WhatsApp
                  </a>
                </div>
              </div>

              {/* Five-minute cancellation countdown window */}
              {liveOrderStatus?.status !== "cancelled" && liveOrderStatus?.status !== "completed" && (
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: "14px",
                    background: cancelCountdown !== null && cancelCountdown > 0 ? "#fef2f2" : "#f8fafc",
                    border:
                      cancelCountdown !== null && cancelCountdown > 0
                        ? "1px solid #fecaca"
                        : "1px solid #e2e8f0",
                    marginBottom: "14px",
                  }}
                >
                  {canCancelByStatus && cancelCountdown !== null && cancelCountdown > 0 ? (
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: showCancelPrompt ? "10px" : 0,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "18px" }}>⏱️</span>
                          <div>
                            <strong style={{ display: "block", fontSize: "12px", color: "#991b1b" }}>
                              5-Minute Order Cancellation Window
                            </strong>
                            <span style={{ fontSize: "11px", color: "#b91c1c", fontWeight: 700 }}>
                              Remaining: {Math.floor(cancelCountdown / 60).toString().padStart(2, "0")}:
                              {(cancelCountdown % 60).toString().padStart(2, "0")}
                            </span>
                          </div>
                        </div>
                        {!showCancelPrompt && (
                          <button
                            type="button"
                            onClick={() => setShowCancelPrompt(true)}
                            style={{
                              padding: "6px 14px",
                              borderRadius: "8px",
                              background: "#dc2626",
                              color: "#ffffff",
                              border: "none",
                              fontSize: "12px",
                              fontWeight: 700,
                              cursor: "pointer",
                              boxShadow: "0 2px 6px rgba(220, 38, 38, 0.3)",
                            }}
                          >
                            Cancel Order
                          </button>
                        )}
                      </div>

                      {showCancelPrompt && (
                        <div
                          style={{
                            paddingTop: "10px",
                            borderTop: "1px dashed #fca5a5",
                          }}
                        >
                          <label
                            style={{
                              display: "block",
                              fontSize: "11px",
                              fontWeight: 700,
                              color: "#7f1d1d",
                              marginBottom: "6px",
                            }}
                          >
                            Select cancellation reason:
                          </label>
                          <select
                            value={orderCancelReason}
                            onChange={(e) => setOrderCancelReason(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: "8px",
                              border: "1px solid #f87171",
                              fontSize: "12px",
                              marginBottom: "10px",
                              background: "#ffffff",
                              color: "#1e293b",
                            }}
                          >
                            <option value="Placed by mistake">Placed by mistake</option>
                            <option value="Want to change items or address">
                              Want to change items or address
                            </option>
                            <option value="Delivery time too long">Delivery time too long</option>
                            <option value="Need to re-order later">Need to re-order later</option>
                          </select>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              type="button"
                              disabled={cancellingOrder}
                              onClick={handleCancelActiveOrder}
                              style={{
                                flex: 1,
                                padding: "8px 12px",
                                borderRadius: "8px",
                                background: "#dc2626",
                                color: "#ffffff",
                                border: "none",
                                fontSize: "12px",
                                fontWeight: 800,
                                cursor: cancellingOrder ? "wait" : "pointer",
                              }}
                            >
                              {cancellingOrder ? "Cancelling..." : "Confirm Immediate Cancellation"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowCancelPrompt(false)}
                              style={{
                                padding: "8px 14px",
                                borderRadius: "8px",
                                background: "#e2e8f0",
                                color: "#334155",
                                border: "none",
                                fontSize: "12px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Keep Order
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "11px",
                        color: "#64748b",
                      }}
                    >
                      <span>🔒</span>
                      <span>
                        {canCancelByStatus
                          ? cancelCountdown === null
                            ? "Checking the 5-minute cancellation window…"
                            : "The 5-minute cancellation window has expired. Contact the kitchen for help."
                          : "Cancellation is locked because preparation or delivery has started. Contact the kitchen for help."}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* User-to-Admin In-App Kitchen Chat Widget */}
              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: "16px",
                  padding: "12px 14px",
                  border: "1px solid #e2e8f0",
                  marginBottom: "14px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>💬</span>
                    <strong style={{ fontSize: "12px", color: "#1e293b" }}>
                      Kitchen & Rider In-App Chat
                    </strong>
                  </div>
                  <span
                    style={{
                      fontSize: "10px",
                      background: "#dcfce7",
                      color: "#166534",
                      padding: "2px 8px",
                      borderRadius: "999px",
                      fontWeight: 700,
                    }}
                  >
                    Kitchen Live
                  </span>
                </div>

                {/* Messages feed */}
                <div
                  style={{
                    maxHeight: "130px",
                    minHeight: "60px",
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    padding: "4px 0 8px",
                  }}
                >
                  {orderMessages.length === 0 ? (
                    <p
                      style={{
                        margin: "auto",
                        fontSize: "11px",
                        color: "#94a3b8",
                        textAlign: "center",
                        padding: "8px 0",
                      }}
                    >
                      No messages yet. Send special instructions (e.g. extra raita, less spice) to the chef!
                    </p>
                  ) : (
                    orderMessages.map((msg, i) => {
                      const isCustomer = msg.sender === "customer";
                      return (
                        <div
                          key={i}
                          style={{
                            alignSelf: isCustomer ? "flex-end" : "flex-start",
                            maxWidth: "85%",
                            background: isCustomer ? "#d70f64" : "#ffffff",
                            color: isCustomer ? "#ffffff" : "#1e293b",
                            padding: "6px 10px",
                            borderRadius: "12px",
                            fontSize: "12px",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                            border: isCustomer ? "none" : "1px solid #e2e8f0",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "9px",
                              opacity: 0.8,
                              marginBottom: "2px",
                              fontWeight: 700,
                            }}
                          >
                            {isCustomer ? "You" : "Kitchen Chef"}
                          </div>
                          <div>{msg.body}</div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Chat Form */}
                <form
                  onSubmit={handleSendChatMessage}
                  style={{ display: "flex", gap: "6px", marginTop: "4px" }}
                >
                  <input
                    type="text"
                    placeholder="Type instruction to kitchen..."
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    disabled={chatSending}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "10px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                      background: "#ffffff",
                      color: "#1e293b",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={chatSending || !chatDraft.trim()}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "10px",
                      background: "#d70f64",
                      color: "#ffffff",
                      border: "none",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: chatSending || !chatDraft.trim() ? "not-allowed" : "pointer",
                      opacity: chatSending || !chatDraft.trim() ? 0.6 : 1,
                    }}
                  >
                    {chatSending ? "..." : "Send"}
                  </button>
                </form>
              </div>

              {/* Direct Full Page Link */}
              <div style={{ textAlign: "center", paddingTop: "4px" }}>
                <Link
                  href={`/track-order?id=${encodeURIComponent(activeOrder?.number || "")}`}
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#d70f64",
                    textDecoration: "underline",
                  }}
                >
                  Open Full Order Invoice & Tracking Page ➔
                </Link>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}
