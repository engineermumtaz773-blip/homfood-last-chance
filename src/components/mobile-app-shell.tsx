"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "@/components/cart-provider";
import { useSiteSettings, type Locale, type Theme } from "@/components/site-settings";
import { readCustomerProfile, CUSTOMER_AUTH_EVENT, type CustomerProfile } from "@/lib/customer";
import {
  isAppOnline,
  NETWORK_STATUS_EVENT,
} from "@/lib/offline-storage";

export const OPEN_MOBILE_CART_EVENT = "hmf_open_mobile_cart";

export function MobileAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { items } = useCart();
  const { locale, setLocale, theme, setTheme } = useSiteSettings();

  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadNotifications] = useState(0);
  const [online, setOnline] = useState(true);

  // Preference switches
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);

  // Pull to refresh states
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);

  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    const initialRead = window.requestAnimationFrame(() => {
      setCustomer(readCustomerProfile());
      setOnline(isAppOnline());
    });

    const onAuth = (e: Event) => {
      const ce = e as CustomEvent<CustomerProfile | null>;
      setCustomer(ce.detail || null);
    };
    const onNetwork = () => {
      setOnline(isAppOnline());
    };

    window.addEventListener(CUSTOMER_AUTH_EVENT, onAuth);
    window.addEventListener(NETWORK_STATUS_EVENT, onNetwork);
    window.addEventListener("online", onNetwork);
    window.addEventListener("offline", onNetwork);

    return () => {
      window.cancelAnimationFrame(initialRead);
      window.removeEventListener(CUSTOMER_AUTH_EVENT, onAuth);
      window.removeEventListener(NETWORK_STATUS_EVENT, onNetwork);
      window.removeEventListener("online", onNetwork);
      window.removeEventListener("offline", onNetwork);
    };
  }, []);

  // Close drawer and notification popover on route change
  useEffect(() => {
    const closePopoverFrame = window.requestAnimationFrame(() => {
      setDrawerOpen(false);
      setNotificationsOpen(false);
    });
    return () => window.cancelAnimationFrame(closePopoverFrame);
  }, [pathname]);

  // Pull to refresh handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (typeof window !== "undefined" && window.scrollY === 0) {
      touchStartY.current = e.touches[0].clientY;
    } else {
      touchStartY.current = 0;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current <= 0 || refreshing) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY.current;
    if (diff > 0 && diff < 120) {
      setPullY(diff);
    }
  };

  const handleTouchEnd = () => {
    if (pullY > 65 && !refreshing) {
      setRefreshing(true);
      setPullY(50);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([15, 30]);
      }
      // Play audio chime if enabled
      if (soundEnabled && typeof Audio !== "undefined") {
        try {
          const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
          osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
          gain.gain.setValueAtTime(0.12, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.15);
          osc.start();
          osc.stop(ctx.currentTime + 0.15);
        } catch { /* AudioContext fallback */ }
      }
      window.setTimeout(() => {
        setRefreshing(false);
        setPullY(0);
        window.location.reload();
      }, 700);
    } else {
      setPullY(0);
    }
    touchStartY.current = 0;
  };

  const openMobileCart = () => {
    window.dispatchEvent(new CustomEvent(OPEN_MOBILE_CART_EVENT));
  };

  const navTabs = [
    {
      label: "Home",
      href: pathname?.startsWith("/app/mobile") ? "/app/mobile" : pathname?.startsWith("/mobile") ? "/mobile" : "/",
      icon: "🏠",
      active: pathname === "/" || pathname === "/mobile" || pathname === "/app/mobile",
    },
    { label: "Menu", href: "/menu", icon: "🍲", active: pathname === "/menu" },
    { label: "Cart", isCart: true, icon: "🛍️", active: false },
    { label: "Orders", href: "/track-order", icon: "📦", active: pathname === "/track-order" },
    { label: "Account", href: "/profile", icon: "👤", active: pathname === "/profile" },
  ];

  return (
    <div
      className="native-mobile-app-shell"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: "relative",
        minHeight: "100svh",
        display: "flex",
        flexDirection: "column",
        background: theme === "dark" ? "#0b100e" : "#fdfefe",
        color: theme === "dark" ? "#f1f5f9" : "#0f172a",
        boxShadow: "0 0 40px rgba(16, 88, 54, 0.25), inset 0 0 20px rgba(255, 191, 0, 0.15)",
        maxWidth: "430px",
        margin: "0 auto",
        overflowX: "hidden",
      }}
    >
      {/* Pull to refresh visual spinner */}
      <AnimatePresence>
        {(pullY > 0 || refreshing) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: pullY }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(180deg, rgba(16,185,129,0.15) 0%, transparent 100%)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 14px",
                borderRadius: 20,
                background: "#10b981",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                boxShadow: "0 4px 12px rgba(16,185,129,0.3)",
              }}
            >
              <span style={{ animation: "spin 1s linear infinite" }}>↻</span>
              <span>{refreshing ? "Refreshing..." : "Pull down to refresh"}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offline Status Bar Alert */}
      {!online && (
        <div
          role="status"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 65,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "8px 14px",
            background: "linear-gradient(90deg, #b45309 0%, #d97706 100%)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.4px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
          }}
        >
          <span>⚡</span>
          <span>Offline Mode — Browsing locally cached dishes & deals</span>
        </div>
      )}

      {/* 1. Fixed Native Mobile Top Header */}
      <header
        style={{
          position: "sticky",
          top: !online ? "34px" : 0,
          zIndex: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: theme === "dark" ? "rgba(11, 16, 14, 0.94)" : "rgba(255, 255, 255, 0.94)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: theme === "dark" ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.06)",
        }}
      >
        {/* Brand Logo & Title */}
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div style={{ position: "relative" }}>
            <img
              src="/image_6c70d8.jpg"
              alt="Home Made Food"
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                boxShadow: "0 0 14px rgba(16, 185, 129, 0.55)",
                border: "2px solid #10b981",
                objectFit: "cover",
              }}
            />
            <span
              style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: online ? "#10b981" : "#f59e0b",
                border: "2px solid #fff",
                boxShadow: online ? "0 0 6px #10b981" : "0 0 6px #f59e0b",
              }}
            />
          </div>
          <div>
            <strong style={{ display: "block", fontSize: 15, fontWeight: 800, lineHeight: 1.15 }}>
              Home Made Food
            </strong>
            <span style={{ fontSize: 10, color: "#10b981", fontWeight: 700, letterSpacing: "0.5px" }}>
              BAHAWALPUR KITCHEN
            </span>
          </div>
        </Link>

        {/* Right Action Icons: Notification Bell & Hamburger Menu */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Dynamic Notification Bell */}
          <button
            type="button"
            onClick={() => {
              setNotificationsOpen(!notificationsOpen);
            }}
            aria-label="Notifications"
            style={{
              position: "relative",
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: theme === "dark" ? "#1e2925" : "#f1f5f3",
              border: theme === "dark" ? "1px solid #2d3b35" : "1px solid #e2ebe5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "inherit",
            }}
          >
            <span style={{ fontSize: 17 }}>🔔</span>
            {unreadNotifications > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -2,
                  right: -2,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#ef4444",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 800,
                  display: "grid",
                  placeItems: "center",
                  boxShadow: "0 0 8px rgba(239, 68, 68, 0.6)",
                  border: "2px solid #fff",
                }}
              >
                {unreadNotifications}
              </span>
            )}
          </button>

          {/* Sliding Hamburger Drawer Trigger */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open primary menu drawer"
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: theme === "dark" ? "#1e2925" : "#f1f5f3",
              border: theme === "dark" ? "1px solid #2d3b35" : "1px solid #e2ebe5",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              cursor: "pointer",
              padding: 0,
            }}
          >
            <span style={{ width: 18, height: 2, borderRadius: 2, background: theme === "dark" ? "#e2e8f0" : "#1e293b" }} />
            <span style={{ width: 14, height: 2, borderRadius: 2, background: theme === "dark" ? "#e2e8f0" : "#1e293b" }} />
            <span style={{ width: 18, height: 2, borderRadius: 2, background: theme === "dark" ? "#e2e8f0" : "#1e293b" }} />
          </button>
        </div>
      </header>

      {/* Notifications Popover Dropdown */}
      <AnimatePresence>
        {notificationsOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            style={{
              position: "fixed",
              top: 60,
              right: 16,
              width: "min(320px, 92vw)",
              background: theme === "dark" ? "#161f1c" : "#ffffff",
              border: theme === "dark" ? "1px solid #283731" : "1px solid #e2ebe5",
              borderRadius: 16,
              boxShadow: "0 15px 40px rgba(0,0,0,0.25)",
              zIndex: 70,
              padding: 16,
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <strong style={{ fontSize: 14, fontWeight: 700 }}>Kitchen Notifications</strong>
              <button
                type="button"
                onClick={() => setNotificationsOpen(false)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16 }}
              >
                ✕
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>No new notifications.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Page Viewport */}
      <main style={{ flex: 1, paddingBottom: "88px" }}>{children}</main>

      {/* 2. Sliding Navigation & Preferences Drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.55)",
                backdropFilter: "blur(4px)",
                zIndex: 80,
              }}
            />

            {/* Slide-out Drawer */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 350, damping: 32 }}
              style={{
                position: "fixed",
                top: 0,
                bottom: 0,
                left: 0,
                width: "min(340px, 86vw)",
                background: theme === "dark" ? "#0f1513" : "#ffffff",
                color: theme === "dark" ? "#f1f5f9" : "#0f172a",
                boxShadow: "10px 0 45px rgba(0,0,0,0.3)",
                zIndex: 85,
                display: "flex",
                flexDirection: "column",
                overflowY: "auto",
                borderRight: theme === "dark" ? "1px solid #23312a" : "1px solid #e2ebe5",
              }}
            >
              {/* Drawer Top Profile Card */}
              <div
                style={{
                  padding: "24px 20px 20px",
                  background: theme === "dark" ? "linear-gradient(135deg, #16241e 0%, #0d1713 100%)" : "linear-gradient(135deg, #ecfdf5 0%, #e0f2fe 100%)",
                  borderBottom: theme === "dark" ? "1px solid #23312a" : "1px solid #e2ebe5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <img
                    src={customer?.avatarUrl || "/image_6c70d8.jpg"}
                    alt="Customer"
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      objectFit: "cover",
                      boxShadow: "0 0 14px rgba(16, 185, 129, 0.4)",
                      border: "2px solid #10b981",
                    }}
                  />
                  <div>
                    <strong style={{ display: "block", fontSize: 15, fontWeight: 800 }}>
                      {customer?.name || "Welcome Guest"}
                    </strong>
                    <span style={{ fontSize: 12, color: "#10b981", fontWeight: 600 }}>
                      {customer ? customer.email || customer.phone || "Verified Customer" : "Tap Profile to Sign In"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "inherit",
                    fontSize: 20,
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Navigation Links */}
              <nav style={{ padding: "16px", display: "grid", gap: 4 }}>
                {[
                  { label: "Home", href: "/", icon: "🏠" },
                  { label: "Our Fresh Menu", href: "/menu", icon: "🍲" },
                  { label: "Daily Deals & Combos", href: "/daily-deals", icon: "🏷️" },
                  { label: "Track Live Order", href: "/track-order", icon: "📦" },
                  { label: "Customer Profile", href: "/profile", icon: "👤" },
                  { label: "About Home Made Food", href: "/about", icon: "ℹ️" },
                  { label: "Contact & WhatsApp", href: "/contact", icon: "📞" },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      borderRadius: 10,
                      textDecoration: "none",
                      color: pathname === item.href ? "#10b981" : "inherit",
                      background: pathname === item.href ? (theme === "dark" ? "#16251e" : "#ecfdf5") : "transparent",
                      fontWeight: pathname === item.href ? 800 : 600,
                      fontSize: 14,
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                ))}
              </nav>

              {/* 4. Dedicated Mobile Settings & Preferences Section */}
              <div
                style={{
                  margin: "auto 16px 20px",
                  padding: "16px",
                  borderRadius: 14,
                  background: theme === "dark" ? "#16201c" : "#f8fafc",
                  border: theme === "dark" ? "1px solid #24352d" : "1px solid #e2e8f0",
                  display: "grid",
                  gap: 14,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <strong style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.6px", color: "#10b981" }}>
                    ⚙️ App Preferences
                  </strong>
                  <span style={{ fontSize: 11, color: "#64748b" }}>v2.4 PWA</span>
                </div>

                {/* Dark / Light Mode Switch */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Theme Mode</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => setTheme("light")}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: theme === "light" ? "1px solid #10b981" : "1px solid transparent",
                        background: theme === "light" ? "#10b981" : "transparent",
                        color: theme === "light" ? "#fff" : "inherit",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      ☀️ Light
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme("dark")}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: theme === "dark" ? "1px solid #10b981" : "1px solid transparent",
                        background: theme === "dark" ? "#10b981" : "transparent",
                        color: theme === "dark" ? "#fff" : "inherit",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      🌙 Dark
                    </button>
                  </div>
                </div>

                {/* Language Switcher */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Language</span>
                  <select
                    value={locale}
                    onChange={(e) => setLocale(e.target.value as Locale)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid #cbd5e1",
                      background: theme === "dark" ? "#0f1714" : "#fff",
                      color: "inherit",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <option value="en">English</option>
                    <option value="ur">اردو (Urdu)</option>
                    <option value="ur-Latn">Roman Urdu</option>
                    <option value="sd">سنڌي (Sindhi)</option>
                  </select>
                </div>

                {/* Sound Effects Toggle */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Tap Sound Effects</span>
                  <input
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={(e) => setSoundEnabled(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: "#10b981", cursor: "pointer" }}
                  />
                </div>

                {/* Push Notifications Toggle */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Order Audio Alerts</span>
                  <input
                    type="checkbox"
                    checked={pushEnabled}
                    onChange={(e) => setPushEnabled(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: "#10b981", cursor: "pointer" }}
                  />
                </div>

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 3. Bottom Native Navigation Bar */}
      <nav
        role="navigation"
        aria-label="Mobile native bottom navigation"
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: "600px",
          zIndex: 60,
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          alignItems: "center",
          height: 64,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          background: theme === "dark" ? "rgba(14, 21, 18, 0.95)" : "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: theme === "dark" ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.06)",
          boxShadow: "0 -8px 25px rgba(0,0,0,0.08)",
        }}
      >
        {navTabs.map((tab, idx) => {
          if (tab.isCart) {
            // Center elevated Bag / Cart button
            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                }}
              >
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.92 }}
                  onClick={openMobileCart}
                  aria-label="Open Cart"
                  style={{
                    position: "absolute",
                    top: -22,
                    width: 54,
                    height: 54,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #d70f64 0%, #b80d56 100%)", // Foodpanda Signature Pink
                    color: "#fff",
                    border: "3px solid #fff",
                    boxShadow: "0 8px 22px rgba(215, 15, 100, 0.45)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    cursor: "pointer",
                  }}
                >
                  <span>🛍️</span>
                  {cartCount > 0 && (
                    <span
                      style={{
                        position: "absolute",
                        top: -4,
                        right: -4,
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: "#ef4444",
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 900,
                        display: "grid",
                        placeItems: "center",
                        border: "2px solid #fff",
                      }}
                    >
                      {cartCount}
                    </span>
                  )}
                </motion.button>
              </div>
            );
          }

          return (
            <Link
              key={idx}
              href={tab.href || "/"}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                height: "100%",
                textDecoration: "none",
                color: tab.active ? "#d70f64" : theme === "dark" ? "#94a3b8" : "#64748b",
                position: "relative",
                transition: "color 0.15s ease",
              }}
            >
              <span style={{ fontSize: 18, transform: tab.active ? "scale(1.15)" : "scale(1)" }}>
                {tab.icon}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: tab.active ? 800 : 500,
                  letterSpacing: "0.2px",
                }}
              >
                {tab.label}
              </span>
              {tab.active && (
                <motion.span
                  layoutId="activeTabPill"
                  style={{
                    position: "absolute",
                    bottom: 4,
                    width: 14,
                    height: 3,
                    borderRadius: 3,
                    background: "#d70f64",
                  }}
                />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
