"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

type AnalyticsData = {
  totalRevenue: number;
  totalOrders: number;
  deliveredOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  todaysRevenue: number;
  todaysOrdersCount: number;
  totalCustomers: number;
  activeDishesCount: number;
  topDishes: Array<{ name: string; count: number; revenue: number }>;
};

export function AdminAnalyticsManager() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchAnalytics() {
    try {
      setRefreshing(true);
      const res = await fetch("/api/analytics", { cache: "no-store" });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message = typeof json === "object" && json !== null && "message" in json && typeof json.message === "string"
          ? json.message
          : typeof json === "object" && json !== null && "error" in json && typeof json.error === "string"
            ? json.error
            : `Analytics service returned HTTP ${res.status}.`;
        throw new Error(message);
      }
      const analytics = typeof json === "object" && json !== null && "analytics" in json ? json.analytics : null;
      if (typeof analytics !== "object" || analytics === null || !("topDishes" in analytics) || !Array.isArray(analytics.topDishes)) {
        throw new Error("Analytics service returned an invalid response.");
      }
      setData(analytics as AnalyticsData);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load store analytics data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void fetchAnalytics();
    const interval = window.setInterval(fetchAnalytics, 30000);
    return () => window.clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ height: 48, borderRadius: 10, background: "#f3f4f6", animation: "pulse 1.5s infinite" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} style={{ height: 110, borderRadius: 12, background: "#f3f4f6", animation: "pulse 1.5s infinite" }} />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: 28, background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", textAlign: "center" }}>
        <p style={{ color: "#ef4444", fontWeight: 600 }}>{error || "Analytics unavailable."}</p>
        <button
          type="button"
          onClick={() => void fetchAnalytics()}
          style={{ padding: "8px 16px", borderRadius: 8, background: "#10b981", color: "#fff", border: "none", cursor: "pointer" }}
        >
          Try Again
        </button>
      </div>
    );
  }

  const cards = [
    { label: "Total Revenue", value: `Rs. ${data.totalRevenue.toLocaleString()}`, note: "All-time confirmed sales", icon: "💰", color: "#10b981" },
    { label: "Today's Revenue", value: `Rs. ${data.todaysRevenue.toLocaleString()}`, note: `${data.todaysOrdersCount} orders placed today`, icon: "📈", color: "#3b82f6" },
    { label: "Total Orders", value: String(data.totalOrders), note: `${data.deliveredOrders} delivered`, icon: "📦", color: "#8b5cf6" },
    { label: "Pending Orders", value: String(data.pendingOrders), note: "In kitchen or delivering", icon: "⏳", color: "#f59e0b" },
    { label: "Registered Customers", value: String(data.totalCustomers), note: "Verified emails & numbers", icon: "👥", color: "#ec4899" },
    { label: "Active Dishes", value: String(data.activeDishesCount), note: "Available on live menu", icon: "🍲", color: "#14b8a6" },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: "1px" }}>
            FINANCIAL & OPERATIONAL INSIGHTS
          </span>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: "#111827", margin: "4px 0 0" }}>Store Analytics</h2>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6b7280" }}>
            Real-time revenue metrics, order velocity, and customer demand synchronized from store database.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchAnalytics()}
          disabled={refreshing}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 18px",
            borderRadius: 8,
            background: "#fff",
            border: "1px solid #d1d5db",
            color: "#374151",
            fontSize: 13,
            fontWeight: 600,
            cursor: refreshing ? "not-allowed" : "pointer",
          }}
        >
          <span style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }}>↻</span>
          {refreshing ? "Refreshing..." : "Refresh Data"}
        </button>
      </div>

      {/* Metric Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 28 }}>
        {cards.map((c, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            style={{
              background: "#fff",
              borderRadius: 14,
              border: "1px solid #e5e7eb",
              padding: "20px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>{c.label}</span>
              <span style={{ fontSize: 20 }}>{c.icon}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#111827", letterSpacing: "-0.5px" }}>{c.value}</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>{c.note}</div>
          </motion.div>
        ))}
      </div>

      {/* Grid: Top Dishes & Status Breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
        {/* Top 5 Best Sellers */}
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px", color: "#111827" }}>
            🏆 Top Selling Dishes
          </h3>
          {data.topDishes.length === 0 ? (
            <p style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic" }}>No dish sales recorded yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {data.topDishes.map((dish, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "#f9fafb",
                    border: "1px solid #f3f4f6",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#10b981", color: "#fff", fontSize: 11, fontWeight: 700, display: "grid", placeItems: "center" }}>
                      {i + 1}
                    </span>
                    <div>
                      <strong style={{ display: "block", fontSize: 14, color: "#111827" }}>{dish.name}</strong>
                      <small style={{ color: "#6b7280", fontSize: 12 }}>{dish.count} orders</small>
                    </div>
                  </div>
                  <strong style={{ fontSize: 14, color: "#065f46" }}>Rs. {dish.revenue.toLocaleString()}</strong>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Order Status Distribution */}
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px", color: "#111827" }}>
            📊 Order Status Overview
          </h3>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 8, background: "#ecfdf5", border: "1px solid #a7f3d0" }}>
              <div>
                <strong style={{ color: "#065f46", fontSize: 14, display: "block" }}>Delivered Orders</strong>
                <small style={{ color: "#047857" }}>Completed successfully</small>
              </div>
              <span style={{ fontSize: 18, fontWeight: 800, color: "#065f46" }}>{data.deliveredOrders}</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a" }}>
              <div>
                <strong style={{ color: "#92400e", fontSize: 14, display: "block" }}>Active / Pending Orders</strong>
                <small style={{ color: "#b45309" }}>In kitchen or dispatched</small>
              </div>
              <span style={{ fontSize: 18, fontWeight: 800, color: "#92400e" }}>{data.pendingOrders}</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca" }}>
              <div>
                <strong style={{ color: "#991b1b", fontSize: 14, display: "block" }}>Cancelled Orders</strong>
                <small style={{ color: "#b91c1c" }}>Customer or kitchen cancellations</small>
              </div>
              <span style={{ fontSize: 18, fontWeight: 800, color: "#991b1b" }}>{data.cancelledOrders}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
