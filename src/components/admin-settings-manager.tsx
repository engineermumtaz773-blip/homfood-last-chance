"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { StoreSettings } from "@/lib/store-db";
import { REALTIME_SYNC_EVENT } from "@/lib/realtime-client";
import { broadcastRealtimeEvent } from "@/lib/realtime-bus";

type TabId = "restaurant" | "delivery" | "payments" | "businessHours" | "social" | "account";

const tabs: { id: TabId; label: string; icon: string; kicker: string }[] = [
  { id: "restaurant", label: "Restaurant", icon: "🏠", kicker: "Branding & Contact Info" },
  { id: "delivery", label: "Delivery", icon: "🛵", kicker: "Fees, Thresholds & Areas" },
  { id: "payments", label: "Payments", icon: "💳", kicker: "Raast, Bank Details & Tax" },
  { id: "businessHours", label: "Business Hours", icon: "⏰", kicker: "Weekly Schedule & Holidays" },
  { id: "social", label: "Social", icon: "🌐", kicker: "Social Channels & Support" },
  { id: "account", label: "Account", icon: "🛡️", kicker: "Admin Security & Access" },
];

export function AdminSettingsManager() {
  const [activeTab, setActiveTab] = useState<TabId>("restaurant");
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // New Area input helper
  const [newAreaInput, setNewAreaInput] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (mounted && data.settings) {
          setSettings(data.settings);
        }
      } catch (err) {
        console.error("Could not fetch settings:", err);
        if (mounted) {
          setToast({ message: "Failed to load store settings from database.", type: "error" });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadSettings();
    const onRealtimeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ table?: string }>).detail;
      if (detail?.table === "store_settings") void loadSettings();
    };
    window.addEventListener(REALTIME_SYNC_EVENT, onRealtimeChange);
    return () => {
      mounted = false;
      window.removeEventListener(REALTIME_SYNC_EVENT, onRealtimeChange);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setToast(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSettings(data.settings);
        window.dispatchEvent(new Event(REALTIME_SYNC_EVENT));
        broadcastRealtimeEvent({ type: "settings_updated", message: "Store hours and settings were synchronized." });
        setToast({
          message: "All settings saved and synchronized live with storefront!",
          type: "success",
        });
      } else {
        throw new Error(data.error || "Save operation failed");
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
      setToast({
        message: err instanceof Error ? err.message : "Could not persist settings to database.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 18, padding: "20px 0" }}>
        <div style={{ height: 48, borderRadius: 12, background: "rgba(0,0,0,0.06)", animation: "pulse 1.5s infinite" }} />
        <div style={{ height: 320, borderRadius: 16, background: "rgba(0,0,0,0.05)", animation: "pulse 1.5s infinite" }} />
      </div>
    );
  }

  if (!settings) {
    return (
      <div style={{ padding: 32, textAlign: "center", background: "#fff", borderRadius: 14 }}>
        <p style={{ color: "#ef4444", fontWeight: 600 }}>Unable to load settings data.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: 12,
            padding: "8px 18px",
            borderRadius: 8,
            background: "#10b981",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const daysOfWeek = [
    { key: "monday", label: "Monday" },
    { key: "tuesday", label: "Tuesday" },
    { key: "wednesday", label: "Wednesday" },
    { key: "thursday", label: "Thursday" },
    { key: "friday", label: "Friday" },
    { key: "saturday", label: "Saturday" },
    { key: "sunday", label: "Sunday" },
  ];
  const mealSlots = settings.businessHours.mealSlots || [
    { name: "Breakfast" as const, open: "05:00", close: "10:00", enabled: true },
    { name: "Lunch" as const, open: "12:00", close: "15:00", enabled: true },
    { name: "Dinner" as const, open: "18:00", close: "23:00", enabled: true },
  ];

  return (
    <div className="admin-settings-container" style={{ position: "relative" }}>
      {/* Toast Alert */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            style={{
              position: "fixed",
              top: 24,
              right: 24,
              zIndex: 99999,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 20px",
              borderRadius: 12,
              background: toast.type === "success" ? "#064e3b" : "#7f1d1d",
              color: "#fff",
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
              border: `1px solid ${toast.type === "success" ? "#10b981" : "#ef4444"}`,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            <span>{toast.type === "success" ? "✓" : "⚠"}</span>
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", marginLeft: 8 }}
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header with Save Button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 24,
          paddingBottom: 16,
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: "1px" }}>
            CONFIGURATION & ENGINE
          </span>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: "#111827", margin: "4px 0 0" }}>Store Settings</h2>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6b7280" }}>
            Update restaurant rules, delivery parameters, payment accounts, and operating hours in real-time.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 24px",
            borderRadius: 10,
            background: saving ? "#6ee7b7" : "#10b981",
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            border: "none",
            cursor: saving ? "not-allowed" : "pointer",
            boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
            transition: "all 0.2s ease",
          }}
        >
          {saving ? (
            <>
              <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>◌</span> Saving Changes...
            </>
          ) : (
            <>
              <span>💾</span> Save All Settings
            </>
          )}
        </button>
      </div>

      {/* 6 Tabs Navigation */}
      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          paddingBottom: 8,
          marginBottom: 24,
          borderBottom: "1px solid #e5e7eb",
        }}
        role="tablist"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 18px",
                borderRadius: 10,
                border: "none",
                background: isActive ? "#111827" : "#f3f4f6",
                color: isActive ? "#fff" : "#4b5563",
                fontWeight: isActive ? 700 : 500,
                fontSize: 13,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.2s ease",
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", padding: "28px", boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
        <AnimatePresence mode="wait">
          {/* TAB 1: RESTAURANT */}
          {activeTab === "restaurant" && (
            <motion.div
              key="restaurant"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.25 }}
              style={{ display: "grid", gap: 20 }}
            >
              <div style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: 12 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#111827" }}>Restaurant Identity & Status</h3>
                <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>Control basic brand info and open/closed status displayed on storefront.</p>
              </div>

              {/* Open / Closed Toggle */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 20px",
                  borderRadius: 12,
                  background: settings.restaurant.isOpen ? "#ecfdf5" : "#fef2f2",
                  border: `1px solid ${settings.restaurant.isOpen ? "#a7f3d0" : "#fecaca"}`,
                }}
              >
                <div>
                  <strong style={{ display: "block", fontSize: 15, color: settings.restaurant.isOpen ? "#065f46" : "#991b1b" }}>
                    {settings.restaurant.isOpen ? "🟢 Kitchen Open for Orders" : "🔴 Kitchen Closed"}
                  </strong>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>
                    {settings.restaurant.isOpen
                      ? "Storefront is accepting online orders and delivering normally."
                      : "Storefront displays closed banner. Customers cannot place new checkout orders."}
                  </span>
                </div>
                <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={settings.restaurant.isOpen}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        restaurant: { ...settings.restaurant, isOpen: e.target.checked },
                      })
                    }
                    style={{ width: 20, height: 20, cursor: "pointer", accentColor: "#10b981" }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{settings.restaurant.isOpen ? "Open" : "Closed"}</span>
                </label>
              </div>

              {/* Grid of Inputs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Restaurant Name</label>
                  <input
                    type="text"
                    value={settings.restaurant.name}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        restaurant: { ...settings.restaurant, name: e.target.value },
                      })
                    }
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Phone Number</label>
                  <input
                    type="text"
                    value={settings.restaurant.phone}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        restaurant: { ...settings.restaurant, phone: e.target.value },
                      })
                    }
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>WhatsApp Orders Number</label>
                  <input
                    type="text"
                    value={settings.restaurant.whatsapp}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        restaurant: { ...settings.restaurant, whatsapp: e.target.value },
                      })
                    }
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Contact / Order Email</label>
                  <input
                    type="email"
                    value={settings.restaurant.email}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        restaurant: { ...settings.restaurant, email: e.target.value },
                      })
                    }
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Restaurant Description / Tagline</label>
                <textarea
                  rows={2}
                  value={settings.restaurant.description}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      restaurant: { ...settings.restaurant, description: e.target.value },
                    })
                  }
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Physical Address / Kitchen Location</label>
                <input
                  type="text"
                  value={settings.restaurant.address}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      restaurant: { ...settings.restaurant, address: e.target.value },
                    })
                  }
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Brand Logo URL / Path</label>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <input
                    type="text"
                    value={settings.restaurant.logoUrl}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        restaurant: { ...settings.restaurant, logoUrl: e.target.value },
                      })
                    }
                    style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                    placeholder="/image_6c70d8.jpg or https://..."
                  />
                  {settings.restaurant.logoUrl && (
                    <img
                      src={settings.restaurant.logoUrl}
                      alt="Logo preview"
                      style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: "1px solid #e5e7eb" }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/image_6c70d8.jpg";
                      }}
                    />
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 2: DELIVERY */}
          {activeTab === "delivery" && (
            <motion.div
              key="delivery"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.25 }}
              style={{ display: "grid", gap: 20 }}
            >
              <div style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: 12 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#111827" }}>Delivery Configuration</h3>
                <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>Set rider delivery rates, free delivery thresholds, radius, and covered areas.</p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Base Delivery Fee (PKR)</label>
                  <input
                    type="number"
                    value={settings.delivery.baseFee}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        delivery: { ...settings.delivery, baseFee: Math.max(0, Number(e.target.value) || 0) },
                      })
                    }
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                  />
                  <small style={{ color: "#6b7280", fontSize: 11 }}>Applied to all standard deliveries.</small>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Free Delivery Minimum (PKR)</label>
                  <input
                    type="number"
                    value={settings.delivery.freeDeliveryThreshold}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        delivery: { ...settings.delivery, freeDeliveryThreshold: Math.max(0, Number(e.target.value) || 0) },
                      })
                    }
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                  />
                  <small style={{ color: "#6b7280", fontSize: 11 }}>Orders above this value get Rs. 0 delivery.</small>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Estimated Delivery Time</label>
                  <input
                    type="text"
                    value={settings.delivery.estimatedDeliveryTime}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        delivery: { ...settings.delivery, estimatedDeliveryTime: e.target.value },
                      })
                    }
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                    placeholder="35 - 50 mins"
                  />
                  <small style={{ color: "#6b7280", fontSize: 11 }}>Shown prominently in cart and checkout.</small>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Delivery Radius (km)</label>
                  <input
                    type="number"
                    value={settings.delivery.deliveryRadiusKm}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        delivery: { ...settings.delivery, deliveryRadiusKm: Math.max(1, Number(e.target.value) || 1) },
                      })
                    }
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                  />
                  <small style={{ color: "#6b7280", fontSize: 11 }}>Maximum operational delivery distance.</small>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Minimum Order Amount (PKR)</label>
                  <input
                    type="number"
                    value={settings.delivery.minOrderAmount}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        delivery: { ...settings.delivery, minOrderAmount: Math.max(0, Number(e.target.value) || 0) },
                      })
                    }
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                  />
                  <small style={{ color: "#6b7280", fontSize: 11 }}>Subtotal required before order checkout.</small>
                </div>
              </div>

              {/* Delivery Areas Management */}
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Served Delivery Areas</label>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input
                    type="text"
                    value={newAreaInput}
                    onChange={(e) => setNewAreaInput(e.target.value)}
                    placeholder="e.g. Model Town A, Cantt, Satellite Town..."
                    style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (newAreaInput.trim()) {
                          const area = newAreaInput.trim();
                          if (!settings.delivery.deliveryAreas.includes(area)) {
                            setSettings({
                              ...settings,
                              delivery: {
                                ...settings.delivery,
                                deliveryAreas: [...settings.delivery.deliveryAreas, area],
                              },
                            });
                          }
                          setNewAreaInput("");
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newAreaInput.trim()) {
                        const area = newAreaInput.trim();
                        if (!settings.delivery.deliveryAreas.includes(area)) {
                          setSettings({
                            ...settings,
                            delivery: {
                              ...settings.delivery,
                              deliveryAreas: [...settings.delivery.deliveryAreas, area],
                            },
                          });
                        }
                        setNewAreaInput("");
                      }
                    }}
                    style={{
                      padding: "9px 16px",
                      borderRadius: 8,
                      background: "#111827",
                      color: "#fff",
                      border: "none",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Add Area
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {settings.delivery.deliveryAreas.map((area, idx) => (
                    <span
                      key={idx}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 12px",
                        borderRadius: 20,
                        background: "#f3f4f6",
                        fontSize: 12,
                        color: "#374151",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      📍 {area}
                      <button
                        type="button"
                        onClick={() =>
                          setSettings({
                            ...settings,
                            delivery: {
                              ...settings.delivery,
                              deliveryAreas: settings.delivery.deliveryAreas.filter((_, i) => i !== idx),
                            },
                          })
                        }
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#9ca3af",
                          cursor: "pointer",
                          padding: 0,
                          fontSize: 13,
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 3: PAYMENTS */}
          {activeTab === "payments" && (
            <motion.div
              key="payments"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.25 }}
              style={{ display: "grid", gap: 20 }}
            >
              <div style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: 12 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#111827" }}>Payment Gateway & Bank Accounts</h3>
                <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>Configure Cash on Delivery, MCB Raast QR Code, Bank Account / IBAN, and Taxes.</p>
              </div>

              {/* Cash on Delivery Toggle */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 20px",
                  borderRadius: 12,
                  background: "#f9fafb",
                  border: "1px solid #e5e7eb",
                }}
              >
                <div>
                  <strong style={{ display: "block", fontSize: 14, color: "#111827" }}>Cash on Delivery (COD)</strong>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>Allow customers to pay physical cash upon arrival of their meal.</span>
                </div>
                <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={settings.payments.cashOnDelivery}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        payments: { ...settings.payments, cashOnDelivery: e.target.checked },
                      })
                    }
                    style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#10b981" }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{settings.payments.cashOnDelivery ? "Enabled" : "Disabled"}</span>
                </label>
              </div>

              {/* MCB Raast QR & Merchant Fields */}
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 18, background: "#fafafa" }}>
                <h4 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: "#065f46" }}>MCB Raast Instant Payment Settings</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Raast Merchant Name</label>
                    <input
                      type="text"
                      value={settings.payments.raastMerchantName}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          payments: { ...settings.payments, raastMerchantName: e.target.value },
                        })
                      }
                      style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Raast Payment Reference / Phone</label>
                    <input
                      type="text"
                      value={settings.payments.raastRef}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          payments: { ...settings.payments, raastRef: e.target.value },
                        })
                      }
                      style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }}
                    />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>MCB Raast QR Code Image URL</label>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <input
                        type="text"
                        value={settings.payments.raastQrUrl}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            payments: { ...settings.payments, raastQrUrl: e.target.value },
                          })
                        }
                        style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }}
                        placeholder="https://... or /mcb-raast-qr.png"
                      />
                      {settings.payments.raastQrUrl && (
                        <img
                          src={settings.payments.raastQrUrl}
                          alt="Raast QR"
                          style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover", border: "1px solid #d1d5db" }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bank Transfer Details */}
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 18 }}>
                <h4 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: "#1f2937" }}>Bank Transfer Details</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Bank Name</label>
                    <input
                      type="text"
                      value={settings.payments.bankName}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          payments: { ...settings.payments, bankName: e.target.value },
                        })
                      }
                      style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Account Title</label>
                    <input
                      type="text"
                      value={settings.payments.bankAccountTitle}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          payments: { ...settings.payments, bankAccountTitle: e.target.value },
                        })
                      }
                      style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>IBAN / Account Number</label>
                    <input
                      type="text"
                      value={settings.payments.bankIban}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          payments: { ...settings.payments, bankIban: e.target.value },
                        })
                      }
                      style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Tax / Service Percentage (%)</label>
                    <input
                      type="number"
                      value={settings.payments.taxPercentage}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          payments: { ...settings.payments, taxPercentage: Math.max(0, Number(e.target.value) || 0) },
                        })
                      }
                      style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Payment Instructions for Customers</label>
                <textarea
                  rows={2}
                  value={settings.payments.paymentInstructions}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      payments: { ...settings.payments, paymentInstructions: e.target.value },
                    })
                  }
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }}
                />
              </div>
            </motion.div>
          )}

          {/* TAB 4: BUSINESS HOURS */}
          {activeTab === "businessHours" && (
            <motion.div
              key="businessHours"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.25 }}
              style={{ display: "grid", gap: 20 }}
            >
              <div style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: 12 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#111827" }}>Operating Schedule & Holiday Mode</h3>
                <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>Set daily opening and closing hours for each day of the week, emergency holiday mode, and time slots.</p>
              </div>

              {/* Holiday Mode Toggle */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 20px",
                  borderRadius: 12,
                  background: settings.businessHours.holidayMode ? "#fef3c7" : "#f9fafb",
                  border: `1px solid ${settings.businessHours.holidayMode ? "#f59e0b" : "#e5e7eb"}`,
                }}
              >
                <div>
                  <strong style={{ display: "block", fontSize: 14, color: settings.businessHours.holidayMode ? "#92400e" : "#111827" }}>
                    {settings.businessHours.holidayMode ? "🏖️ Holiday Mode Active" : "Normal Kitchen Operations"}
                  </strong>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>
                    Enable during Eid, national holidays, or emergencies to temporarily suspend new orders.
                  </span>
                </div>
                <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={settings.businessHours.holidayMode}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        businessHours: { ...settings.businessHours, holidayMode: e.target.checked },
                      })
                    }
                    style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#f59e0b" }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{settings.businessHours.holidayMode ? "Active" : "Inactive"}</span>
                </label>
              </div>

              {settings.businessHours.holidayMode && (
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#92400e", marginBottom: 6 }}>Custom Holiday Announcement Message</label>
                  <input
                    type="text"
                    value={settings.businessHours.holidayMessage}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        businessHours: { ...settings.businessHours, holidayMessage: e.target.value },
                      })
                    }
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #fcd34d", fontSize: 14 }}
                  />
                </div>
              )}

              {/* Weekly Day Schedule Table */}
              <div>
                <strong style={{ display: "block", fontSize: 14, color: "#111827", marginBottom: 12 }}>Weekly Hours Schedule (Mon - Sun)</strong>
                <div style={{ display: "grid", gap: 10 }}>
                  {daysOfWeek.map(({ key, label }) => {
                    const sched = settings.businessHours.schedule[key] || { open: "11:00", close: "23:00", enabled: true };
                    return (
                      <div
                        key={key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 16px",
                          borderRadius: 8,
                          background: sched.enabled ? "#fff" : "#f9fafb",
                          border: "1px solid #e5e7eb",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ minWidth: 120 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: sched.enabled ? "#111827" : "#9ca3af" }}>{label}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#4b5563" }}>
                            Open:
                            <input
                              type="time"
                              disabled={!sched.enabled}
                              value={sched.open}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  businessHours: {
                                    ...settings.businessHours,
                                    schedule: {
                                      ...settings.businessHours.schedule,
                                      [key]: { ...sched, open: e.target.value },
                                    },
                                  },
                                })
                              }
                              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db" }}
                            />
                          </label>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#4b5563" }}>
                            Close:
                            <input
                              type="time"
                              disabled={!sched.enabled}
                              value={sched.close}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  businessHours: {
                                    ...settings.businessHours,
                                    schedule: {
                                      ...settings.businessHours.schedule,
                                      [key]: { ...sched, close: e.target.value },
                                    },
                                  },
                                })
                              }
                              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db" }}
                            />
                          </label>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                            <input
                              type="checkbox"
                              checked={sched.enabled}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  businessHours: {
                                    ...settings.businessHours,
                                    schedule: {
                                      ...settings.businessHours.schedule,
                                      [key]: { ...sched, enabled: e.target.checked },
                                    },
                                  },
                                })
                              }
                              style={{ accentColor: "#10b981" }}
                            />
                            {sched.enabled ? "Open" : "Closed"}
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Slot Duration (Minutes)</label>
                <input
                  type="number"
                  value={settings.businessHours.slotDurationMinutes}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      businessHours: {
                        ...settings.businessHours,
                        slotDurationMinutes: Math.max(15, Number(e.target.value) || 15),
                      },
                    })
                  }
                  style={{ maxWidth: 200, padding: "9px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }}
                />
              </div>
              <div>
                <strong style={{ display: "block", fontSize: 14, color: "#111827", marginBottom: 10 }}>Meal Slots</strong>
                <div style={{ display: "grid", gap: 10 }}>
                  {mealSlots.map((slot, index) => (
                    <div key={slot.name} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <strong style={{ width: 90 }}>{slot.name}</strong>
                      <input type="time" value={slot.open} onChange={(e) => setSettings({ ...settings, businessHours: { ...settings.businessHours, mealSlots: mealSlots.map((item, itemIndex) => itemIndex === index ? { ...item, open: e.target.value } : item) } })} />
                      <span>to</span>
                      <input type="time" value={slot.close} onChange={(e) => setSettings({ ...settings, businessHours: { ...settings.businessHours, mealSlots: mealSlots.map((item, itemIndex) => itemIndex === index ? { ...item, close: e.target.value } : item) } })} />
                      <label><input type="checkbox" checked={slot.enabled} onChange={(e) => setSettings({ ...settings, businessHours: { ...settings.businessHours, mealSlots: mealSlots.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: e.target.checked } : item) } })} /> Enabled</label>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 5: SOCIAL */}
          {activeTab === "social" && (
            <motion.div
              key="social"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.25 }}
              style={{ display: "grid", gap: 20 }}
            >
              <div style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: 12 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#111827" }}>Social Media & Channels</h3>
                <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>Connect your social media pages and support channels to the storefront footer and header.</p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Facebook URL</label>
                  <input
                    type="url"
                    value={settings.social.facebook}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        social: { ...settings.social, facebook: e.target.value },
                      })
                    }
                    placeholder="https://facebook.com/..."
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Instagram URL</label>
                  <input
                    type="url"
                    value={settings.social.instagram}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        social: { ...settings.social, instagram: e.target.value },
                      })
                    }
                    placeholder="https://instagram.com/..."
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>WhatsApp Business Chat Link</label>
                  <input
                    type="url"
                    value={settings.social.whatsappBusiness}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        social: { ...settings.social, whatsappBusiness: e.target.value },
                      })
                    }
                    placeholder="https://wa.me/..."
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>TikTok Profile URL</label>
                  <input
                    type="url"
                    value={settings.social.tiktok}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        social: { ...settings.social, tiktok: e.target.value },
                      })
                    }
                    placeholder="https://tiktok.com/@..."
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Customer Support Email</label>
                  <input
                    type="email"
                    value={settings.social.supportEmail}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        social: { ...settings.social, supportEmail: e.target.value },
                      })
                    }
                    placeholder="support@homefood.engineer"
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 6: ACCOUNT & SECURITY */}
          {activeTab === "account" && (
            <motion.div
              key="account"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.25 }}
              style={{ display: "grid", gap: 20 }}
            >
              <div style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: 12 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#111827" }}>Admin Security & Notifications</h3>
                <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>Manage authorized administrator emails, notification inboxes, and access credentials.</p>
              </div>

              {/* 2FA Toggle */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 20px",
                  borderRadius: 12,
                  background: "#f9fafb",
                  border: "1px solid #e5e7eb",
                }}
              >
                <div>
                  <strong style={{ display: "block", fontSize: 14, color: "#111827" }}>Two-Factor OTP Authentication (2FA)</strong>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>Requires one-time email OTP code on every administrator login.</span>
                </div>
                <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={settings.account.twoFactorEnabled}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        account: { ...settings.account, twoFactorEnabled: e.target.checked },
                      })
                    }
                    style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#10b981" }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{settings.account.twoFactorEnabled ? "Active" : "Disabled"}</span>
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Admin Security PIN Code</label>
                  <input
                    type="password"
                    maxLength={6}
                    value={settings.account.pinCode}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        account: { ...settings.account, pinCode: e.target.value },
                      })
                    }
                    placeholder="4-6 digit numeric PIN"
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                  />
                  <small style={{ color: "#6b7280", fontSize: 11 }}>Used for high-privilege store actions and overrides.</small>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Session Timeout Duration (Hours)</label>
                  <input
                    type="number"
                    value={settings.account.sessionTimeoutHours}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        account: {
                          ...settings.account,
                          sessionTimeoutHours: Math.max(1, Number(e.target.value) || 1),
                        },
                      })
                    }
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                  />
                  <small style={{ color: "#6b7280", fontSize: 11 }}>Admin cookie auto-expires after this duration.</small>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                    Authorized Admin Emails (comma separated)
                  </label>
                  <input
                    type="text"
                    value={settings.account.adminEmails.join(", ")}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        account: {
                          ...settings.account,
                          adminEmails: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                        },
                      })
                    }
                    placeholder="engineermumtaz773@gmail.com, ..."
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                  />
                  <small style={{ color: "#6b7280", fontSize: 11 }}>Only these email addresses have RBAC access to the Admin Panel.</small>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                    Order Notification Emails (comma separated)
                  </label>
                  <input
                    type="text"
                    value={settings.account.notificationEmails.join(", ")}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        account: {
                          ...settings.account,
                          notificationEmails: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                        },
                      })
                    }
                    placeholder="engineermumtaz773@gmail.com, ..."
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                  />
                  <small style={{ color: "#6b7280", fontSize: 11 }}>Receive instant email alerts whenever a customer places an order.</small>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
