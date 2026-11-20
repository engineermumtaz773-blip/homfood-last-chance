"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { subscribeRealtimeEvents, playAlertChime, type RealtimeEventPayload } from "@/lib/realtime-bus";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const isLoginPage = pathname === "/admin/login";

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [adminEmail, setAdminEmail] = useState<string>("engineermumtaz773@gmail.com");
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [quickKitchenOpen, setQuickKitchenOpen] = useState(true);
  const [quickHolidayMode, setQuickHolidayMode] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickToast, setQuickToast] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminAlert, setAdminAlert] = useState<{ title: string; desc: string; type: "alert" | "info" } | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  // Subscribe to real-time events from mobile app & storefront
  useEffect(() => {
    if (isLoginPage) return;
    const unsubscribe = subscribeRealtimeEvents((event: RealtimeEventPayload) => {
      if (event.type === "order_cancelled") {
        setUnreadNotifications((count) => count + 1);
        playAlertChime("alert");
        setAdminAlert({
          title: `🚨 Order Cancelled: ${event.orderNumber || "Order"}`,
          desc: event.message || "Customer requested order cancellation within the 5-minute window.",
          type: "alert",
        });
      } else if (event.type === "order_created") {
        setUnreadNotifications((count) => count + 1);
        playAlertChime("alert");
        setAdminAlert({
          title: `🔔 New Order Received: ${event.orderNumber || "Order"}`,
          desc: `Customer ${event.customerName || ""} placed a new checkout request.`,
          type: "info",
        });
      } else if (event.type === "chat_message") {
        setUnreadNotifications((count) => count + 1);
        playAlertChime("pop");
        setAdminAlert({
          title: `💬 New Message for ${event.orderNumber || "Order"}`,
          desc: event.message || "Customer sent a message regarding their order.",
          type: "info",
        });
      } else if (event.type === "order_status") {
        setUnreadNotifications((count) => count + 1);
        playAlertChime("pop");
        setAdminAlert({
          title: `📦 Order Updated: ${event.orderNumber || "Order"}`,
          desc: event.message || "An order status changed in real time.",
          type: "info",
        });
      } else if (event.type === "admin_notification") {
        playAlertChime("pop");
        void fetch("/api/notifications?unread=true", { cache: "no-store" })
          .then((response) => response.ok ? response.json() : null)
          .then((payload: { unread?: number; notifications?: Array<{ title?: string; body?: string; order_number?: string }> } | null) => {
            if (!payload) return;
            setUnreadNotifications(payload.unread ?? 0);
            const latest = payload.notifications?.[0];
            setAdminAlert({
              title: latest?.title || "New admin notification",
              desc: latest?.body || (latest?.order_number ? `Order ${latest.order_number} needs review.` : "A new notification was added."),
              type: "info",
            });
          })
          .catch((error: unknown) => console.warn("Could not refresh the admin notification feed.", error));
      }
    });

    return () => unsubscribe();
  }, [isLoginPage]);

  useEffect(() => {
    if (isLoginPage || checkingAuth) return;
    fetch("/api/notifications?unread=true", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload: { unread?: number } | null) => {
        if (payload?.unread !== undefined) setUnreadNotifications(payload.unread);
      })
      .catch((error) => console.warn("Failed to load notification count:", error));
  }, [checkingAuth, isLoginPage]);

  useEffect(() => {
    if (!adminAlert) return;
    const timer = window.setTimeout(() => setAdminAlert(null), 8000);
    return () => window.clearTimeout(timer);
  }, [adminAlert]);

  // Authenticate Admin session via RBAC check
  useEffect(() => {
    if (isLoginPage) {
      const frame = window.requestAnimationFrame(() => setCheckingAuth(false));
      return () => window.cancelAnimationFrame(frame);
    }

    let active = true;
    async function verifyAuth() {
      try {
        const res = await fetch("/api/admin/me", { cache: "no-store" });
        if (!res.ok) {
          // If unauthorized or guest, redirect to / with error toast
          window.location.replace("/?error=access_denied");
          return;
        }
        const data = await res.json();
        if (active && data.authenticated) {
          setAdminEmail(data.email || "engineermumtaz773@gmail.com");
          setCheckingAuth(false);
        } else {
          window.location.replace("/?error=access_denied");
        }
      } catch {
        // Fallback check against dashboard API
        try {
          const dashRes = await fetch("/api/admin/dashboard", { cache: "no-store" });
          if (dashRes.ok) {
            if (active) setCheckingAuth(false);
          } else {
            window.location.replace("/?error=access_denied");
          }
        } catch {
          window.location.replace("/?error=access_denied");
        }
      }
    }

    void verifyAuth();
    return () => {
      active = false;
    };
  }, [isLoginPage]);

  // Load current settings for Quick Settings panel
  useEffect(() => {
    if (isLoginPage) return;
    async function loadCurrentSettings() {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.settings) {
            setQuickKitchenOpen(data.settings.restaurant?.isOpen ?? true);
            setQuickHolidayMode(data.settings.businessHours?.holidayMode ?? false);
          }
        }
      } catch {
        /* Ignore */
      }
    }
    void loadCurrentSettings();
  }, [isLoginPage]);

  async function handleQuickToggle(field: "kitchen" | "holiday") {
    setQuickSaving(true);
    setQuickToast(null);
    try {
      const newKitchen = field === "kitchen" ? !quickKitchenOpen : quickKitchenOpen;
      const newHoliday = field === "holiday" ? !quickHolidayMode : quickHolidayMode;

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant: { isOpen: newKitchen },
          businessHours: { holidayMode: newHoliday },
        }),
      });

      if (res.ok) {
        if (field === "kitchen") setQuickKitchenOpen(newKitchen);
        if (field === "holiday") setQuickHolidayMode(newHoliday);
        setQuickToast(
          field === "kitchen"
            ? `Kitchen is now ${newKitchen ? "OPEN" : "CLOSED"}`
            : `Holiday mode is now ${newHoliday ? "ACTIVE" : "INACTIVE"}`
        );
      }
    } catch {
      setQuickToast("Failed to update status");
    } finally {
      setQuickSaving(false);
    }
  }

  async function handleSignOut() {
    try {
      await fetch("/api/admin/login", { method: "DELETE", cache: "no-store" });
    } catch {
      /* continue redirect */
    }
    router.replace("/admin/login");
  }

  // If this is the login page, render children directly
  if (isLoginPage) {
    return <>{children}</>;
  }

  // While verifying RBAC credentials
  if (checkingAuth) {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c0f17",
          color: "#fff",
          gap: 18,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div style={{ position: "relative" }}>
          <img
            src="/image_6c70d8.jpg"
            alt="Authenticating"
            style={{
              width: 68,
              height: 68,
              borderRadius: "50%",
              boxShadow: "0 0 25px rgba(16, 185, 129, 0.6)",
              border: "3px solid #10b981",
              objectFit: "cover",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: -6,
              borderRadius: "50%",
              border: "2px solid #10b981",
              borderTopColor: "transparent",
              animation: "spin 1s linear infinite",
            }}
          />
        </div>
        <div style={{ textAlign: "center" }}>
          <strong style={{ display: "block", fontSize: 16, color: "#e5e7eb" }}>Verifying Admin Privileges</strong>
          <span style={{ fontSize: 13, color: "#9ca3af" }}>Checking authorized administrator credentials...</span>
        </div>
      </div>
    );
  }

  const navItems = [
    { href: "/admin", label: "Dashboard", icon: "◫" },
    { href: "/admin/orders", label: "Orders", icon: "▤" },
    { href: "/admin/requests", label: "Requests", icon: "◷" },
    { href: "/admin/menu", label: "Menu", icon: "♨" },
    { href: "/admin/deals", label: "Daily Deals", icon: "✦" },
    { href: "/admin/categories", label: "Categories", icon: "◈" },
    { href: "/admin/customers", label: "Customers", icon: "♙" },
    { href: "/admin/analytics", label: "Analytics", icon: "▥" },
    { href: "/admin/settings", label: "Settings", icon: "⚙" },
  ];

  const currentNav = navItems.find((item) =>
    item.href === "/admin" ? pathname === "/admin" : pathname?.startsWith(item.href)
  ) || navItems[0];

  return (
    <div className={`admin-page ${sidebarOpen ? "sidebar-open" : ""}`} style={{ position: "relative" }}>
      {/* Isolated Admin Sidebar */}
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/admin" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src="/image_6c70d8.jpg"
            alt="Home Made Food Logo"
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              boxShadow: "0 0 16px rgba(16, 185, 129, 0.55)",
              border: "2px solid #10b981",
              objectFit: "cover",
            }}
          />
          <span style={{ lineHeight: 1.15 }}>
            <strong style={{ display: "block", fontSize: 15, color: "#fff" }}>Home Made Food</strong>
            <small style={{ color: "#10b981", fontWeight: 700, letterSpacing: "1px", fontSize: 10 }}>ADMIN PORTAL</small>
          </span>
        </Link>

        {/* Navigation Items */}
        <nav className="admin-nav" aria-label="Admin navigation">
          {navItems.map((item) => {
            const isActive = item.href === "/admin" ? pathname === "/admin" : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={isActive ? "active" : ""}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "#fff" : "#9ca3af",
                  background: isActive ? "#1f2937" : "transparent",
                  transition: "all 0.15s ease",
                  textDecoration: "none",
                }}
              >
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                <span>{item.label}</span>
                {item.href === "/admin/orders" && unreadNotifications > 0 && (
                  <span style={{
                    marginLeft: "auto",
                    minWidth: 18,
                    height: 18,
                    padding: "0 5px",
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#10b981",
                    color: "#052e1b",
                    fontSize: 10,
                    fontWeight: 800,
                  }}>
                    {unreadNotifications > 99 ? "99+" : unreadNotifications}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Bottom Profile */}
        <div className="admin-sidebar-bottom" style={{ marginTop: "auto", borderTop: "1px solid #1f2937", paddingTop: 16 }}>
          <span
            className="admin-avatar"
            style={{
              background: "#10b981",
              color: "#fff",
              fontWeight: 800,
              fontSize: 14,
              boxShadow: "0 0 10px rgba(16,185,129,0.3)",
            }}
          >
            {adminEmail.charAt(0).toUpperCase()}
          </span>
          <div style={{ minWidth: 0, overflow: "hidden" }}>
            <span
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "#e5e7eb",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={adminEmail}
            >
              {adminEmail}
            </span>
            <small style={{ color: "#10b981", fontSize: 10, fontWeight: 600 }}>Authorized Administrator</small>
          </div>
        </div>
      </aside>

      {/* Real-time High-Priority Alert Toast from Mobile App Activity */}
      <AnimatePresence>
        {adminAlert && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, y: -30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            style={{
              position: "fixed",
              top: 20,
              right: 24,
              zIndex: 999999,
              maxWidth: 440,
              padding: "14px 18px",
              borderRadius: 14,
              background: adminAlert.type === "alert" ? "#1e0b0b" : "#072016",
              color: "#fff",
              border: `1px solid ${adminAlert.type === "alert" ? "#ef4444" : "#10b981"}`,
              boxShadow: "0 20px 50px rgba(0,0,0,0.4), 0 0 25px rgba(239, 68, 68, 0.25)",
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 22 }}>{adminAlert.type === "alert" ? "🚨" : "🔔"}</span>
            <div style={{ flex: 1 }}>
              <strong style={{ display: "block", fontSize: 14, color: adminAlert.type === "alert" ? "#fca5a5" : "#a7f3d0" }}>
                {adminAlert.title}
              </strong>
              <p style={{ margin: "3px 0 0", fontSize: 12, color: "#cbd5e1", lineHeight: 1.4 }}>
                {adminAlert.desc}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAdminAlert(null)}
              style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16 }}
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Admin Area */}
      <div className="admin-main">
        {/* Topbar with Global Quick Settings & Status */}
        <header
          className="admin-topbar"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 40,
            background: "#fff",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 28px",
            height: 68,
          }}
        >
          {/* Section Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="button" className="admin-sidebar-toggle" aria-label="Toggle admin navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen((open) => !open)}>☰</button>
            <img
              src="/image_6c70d8.jpg"
              alt="Home Made Food"
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                border: "2px solid #10b981",
                boxShadow: "0 0 12px rgba(16, 185, 129, 0.4)",
                objectFit: "cover",
              }}
            />
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#10b981", letterSpacing: "0.8px", textTransform: "uppercase" }}>
                HOME MADE FOOD / {currentNav.label.toUpperCase()}
              </span>
              <strong style={{ display: "block", fontSize: 17, fontWeight: 800, color: "#111827" }}>
                {currentNav.label}
              </strong>
            </div>
          </div>

          {/* Topbar Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Live Database Sync Indicator */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                borderRadius: 20,
                background: "#ecfdf5",
                border: "1px solid #a7f3d0",
                fontSize: 12,
                color: "#065f46",
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#10b981",
                  boxShadow: "0 0 8px #10b981",
                }}
              />
              <span>Live DB Sync</span>
            </div>

            {/* Quick Settings Button */}
            <button
              type="button"
              onClick={() => setQuickSettingsOpen(!quickSettingsOpen)}
              title="Quick Settings Drawer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 8,
                background: quickSettingsOpen ? "#111827" : "#f3f4f6",
                color: quickSettingsOpen ? "#fff" : "#374151",
                border: "1px solid #e5e7eb",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <span style={{ fontSize: 15 }}>⚙</span>
              <span>Quick Settings</span>
            </button>

            {/* Public Storefront Link */}
            <Link
              href="/"
              target="_blank"
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
                color: "#4b5563",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span>Storefront</span>
              <span style={{ fontSize: 11 }}>↗</span>
            </Link>

            {/* Sign Out Button */}
            <button
              type="button"
              onClick={() => void handleSignOut()}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: "#fff",
                border: "1px solid #fecaca",
                color: "#dc2626",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="admin-content" style={{ padding: "28px", minHeight: "calc(100vh - 68px)" }}>
          {children}
        </main>
      </div>

      {/* Quick Settings Slide-Over Drawer */}
      <AnimatePresence>
        {quickSettingsOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setQuickSettingsOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.4)",
                zIndex: 90,
                backdropFilter: "blur(2px)",
              }}
            />

            {/* Slide-out Drawer */}
            <motion.div
              initial={{ x: 380 }}
              animate={{ x: 0 }}
              exit={{ x: 380 }}
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
              style={{
                position: "fixed",
                top: 0,
                right: 0,
                bottom: 0,
                width: "min(380px, 92vw)",
                background: "#fff",
                boxShadow: "-10px 0 35px rgba(0,0,0,0.18)",
                zIndex: 95,
                display: "flex",
                flexDirection: "column",
                borderLeft: "1px solid #e5e7eb",
              }}
            >
              {/* Drawer Header */}
              <div
                style={{
                  padding: "20px 24px",
                  borderBottom: "1px solid #e5e7eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#111827" }}>
                    ⚡ Quick Settings
                  </h3>
                  <small style={{ color: "#6b7280", fontSize: 12 }}>Rapid operational overrides</small>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickSettingsOpen(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    fontSize: 20,
                    cursor: "pointer",
                    color: "#6b7280",
                    padding: 4,
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Drawer Content */}
              <div style={{ padding: "24px", display: "grid", gap: 20, flex: 1, overflowY: "auto" }}>
                {quickToast && (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      background: "#ecfdf5",
                      border: "1px solid #a7f3d0",
                      color: "#065f46",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    ✓ {quickToast}
                  </div>
                )}

                {/* Kitchen Status Toggle */}
                <div
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    background: quickKitchenOpen ? "#ecfdf5" : "#fef2f2",
                    border: `1px solid ${quickKitchenOpen ? "#a7f3d0" : "#fecaca"}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <strong style={{ fontSize: 14, color: quickKitchenOpen ? "#065f46" : "#991b1b" }}>
                      {quickKitchenOpen ? "Kitchen Accepting Orders" : "Kitchen Temporarily Closed"}
                    </strong>
                    <input
                      type="checkbox"
                      checked={quickKitchenOpen}
                      disabled={quickSaving}
                      onChange={() => void handleQuickToggle("kitchen")}
                      style={{ width: 18, height: 18, accentColor: "#10b981", cursor: "pointer" }}
                    />
                  </div>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>
                    Toggles live online ordering availability on the storefront.
                  </span>
                </div>

                {/* Holiday Mode Toggle */}
                <div
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    background: quickHolidayMode ? "#fef3c7" : "#f9fafb",
                    border: `1px solid ${quickHolidayMode ? "#f59e0b" : "#e5e7eb"}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <strong style={{ fontSize: 14, color: quickHolidayMode ? "#92400e" : "#111827" }}>
                      {quickHolidayMode ? "Holiday Mode Active" : "Normal Schedule"}
                    </strong>
                    <input
                      type="checkbox"
                      checked={quickHolidayMode}
                      disabled={quickSaving}
                      onChange={() => void handleQuickToggle("holiday")}
                      style={{ width: 18, height: 18, accentColor: "#f59e0b", cursor: "pointer" }}
                    />
                  </div>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>
                    Pauses checkout with an official holiday announcement banner.
                  </span>
                </div>

                {/* Full Settings Navigation Button */}
                <div style={{ marginTop: "auto", paddingTop: 20, borderTop: "1px solid #f3f4f6" }}>
                  <Link
                    href="/admin/settings"
                    onClick={() => setQuickSettingsOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      width: "100%",
                      padding: "12px 18px",
                      borderRadius: 10,
                      background: "#111827",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 14,
                      textDecoration: "none",
                    }}
                  >
                    <span>⚙</span>
                    <span>Open Full Settings (6 Tabs) →</span>
                  </Link>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
