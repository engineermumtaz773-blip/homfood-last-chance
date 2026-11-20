"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import type { DbOrder, DbOrderStatus } from "@/lib/store-db";
import { REALTIME_SYNC_EVENT } from "@/lib/realtime-client";
import { normalizeWhatsAppNumber } from "@/lib/order-whatsapp";

const STATUS_CONFIG: Record<
  DbOrderStatus,
  { label: string; bg: string; color: string; icon: string }
> = {
  pending: { label: "Pending", bg: "#fef3c7", color: "#b45309", icon: "⏳" },
  new: { label: "New", bg: "#fef3c7", color: "#b45309", icon: "⏳" },
  confirmed: { label: "Confirmed", bg: "#dcfce7", color: "#15803d", icon: "✓" },
  preparing: { label: "Preparing", bg: "#dbeafe", color: "#1d4ed8", icon: "🍳" },
  ready: { label: "Ready", bg: "#dbeafe", color: "#1d4ed8", icon: "✓" },
  out_for_delivery: { label: "Out for Delivery", bg: "#f3e8ff", color: "#7e22ce", icon: "🛵" },
  delivering: { label: "Delivering", bg: "#f3e8ff", color: "#7e22ce", icon: "🛵" },
  arriving: { label: "Arriving", bg: "#f3e8ff", color: "#7e22ce", icon: "🛵" },
  delivered: { label: "Delivered", bg: "#dcfce7", color: "#15803d", icon: "✓" },
  completed: { label: "Completed", bg: "#dcfce7", color: "#15803d", icon: "✓" },
  cancelled: { label: "Cancelled", bg: "#fee2e2", color: "#b91c1c", icon: "✕" },
};

export function AdminOrdersManager() {
  const [orders, setOrders] = useState<DbOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders", { cache: "no-store" });
      const data = await res.json() as { ok?: boolean; error?: string; orders?: DbOrder[] };
      if (!res.ok || !data.ok || !Array.isArray(data.orders)) {
        throw new Error(data.error || `Order API returned ${res.status}.`);
      }
      setOrders(data.orders);
      setLoadError("");
    } catch (err) {
      setOrders([]);
      setLoadError(err instanceof Error ? err.message : "Could not load live orders from Supabase.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void loadOrders(); });
    const interval = setInterval(loadOrders, 5000);
    const onSync = () => { void loadOrders(); };
    window.addEventListener(REALTIME_SYNC_EVENT, onSync);
    return () => { window.cancelAnimationFrame(frame); clearInterval(interval); window.removeEventListener(REALTIME_SYNC_EVENT, onSync); };
  }, [loadOrders]);

  const handleStatusChange = async (number: string, newStatus: DbOrderStatus) => {
    setUpdatingId(number);
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number, status: newStatus }),
      });
      const data = await res.json().catch(() => null) as { order?: DbOrder; warnings?: string[]; error?: string } | null;
      if (!res.ok) throw new Error(data?.error || `Order status update failed (HTTP ${res.status}).`);
      if (data?.order) setOrders((prev) => prev.map((order) => order.number === number ? data.order as DbOrder : order));
      setMessage(data?.warnings?.join(" ") || `Order ${number} status updated to ${STATUS_CONFIG[newStatus].label}.`);
      window.setTimeout(() => setMessage(""), 5000);
    } catch (err) {
      console.error("Failed to update status:", err);
      setMessage(err instanceof Error ? err.message : "Order status update failed.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteOrder = async (number: string) => {
    if (!window.confirm(`Permanently delete order ${number}?`)) return;
    setUpdatingId(number);
    try {
      const res = await fetch(`/api/orders?number=${encodeURIComponent(number)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Order deletion failed");
      setOrders((prev) => prev.filter((order) => order.number !== number));
      setMessage(`Order ${number} deleted.`);
      window.setTimeout(() => setMessage(""), 3500);
    } catch (error) {
      console.error("Failed to delete order:", error);
      setMessage("Could not delete the order.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handlePaymentApproval = async (order: DbOrder) => {
    setUpdatingId(order.number);
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: order.number, status: order.status, paymentStatus: "paid" }),
      });
      if (!res.ok) throw new Error("Payment approval failed.");
      const data = await res.json() as { order?: DbOrder; warnings?: string[] };
      if (data.order) setOrders((current) => current.map((item) => item.number === order.number ? data.order! : item));
      setMessage(data.warnings?.join(" ") || `Payment for ${order.number} marked Paid.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment approval failed.");
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchesStatus = filterStatus === "all" || o.status === filterStatus;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        o.number.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.includes(q) ||
        o.address.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [orders, filterStatus, search]);

  const stats = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter((o) => o.status === "pending" || o.status === "new" || o.status === "confirmed").length;
    const preparing = orders.filter((o) => o.status === "preparing" || o.status === "ready").length;
    const delivering = orders.filter((o) => o.status === "out_for_delivery" || o.status === "delivering" || o.status === "arriving").length;
    const delivered = orders.filter((o) => o.status === "delivered" || o.status === "completed").length;
    const revenue = orders
      .filter((o) => o.status !== "cancelled")
      .reduce((sum, o) => sum + (o.total || 0), 0);
    return { total, pending, preparing, delivering, delivered, revenue };
  }, [orders]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: "14px",
        }}
      >
        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Total Orders</div>
          <div style={kpiValueStyle}>{stats.total}</div>
          <div style={{ fontSize: "11px", color: "#64748b" }}>Lifetime order requests</div>
        </div>
        <div style={kpiCardStyle}>
          <div style={{ ...kpiLabelStyle, color: "#b45309" }}>Pending Kitchen</div>
          <div style={{ ...kpiValueStyle, color: "#b45309" }}>{stats.pending}</div>
          <div style={{ fontSize: "11px", color: "#b45309" }}>Awaiting prep confirmation</div>
        </div>
        <div style={kpiCardStyle}>
          <div style={{ ...kpiLabelStyle, color: "#1d4ed8" }}>Cooking / Prep</div>
          <div style={{ ...kpiValueStyle, color: "#1d4ed8" }}>{stats.preparing}</div>
          <div style={{ fontSize: "11px", color: "#1d4ed8" }}>In homemade kitchen</div>
        </div>
        <div style={kpiCardStyle}>
          <div style={{ ...kpiLabelStyle, color: "#7e22ce" }}>Out for Delivery</div>
          <div style={{ ...kpiValueStyle, color: "#7e22ce" }}>{stats.delivering}</div>
          <div style={{ fontSize: "11px", color: "#7e22ce" }}>Rider on the road</div>
        </div>
        <div style={kpiCardStyle}>
          <div style={{ ...kpiLabelStyle, color: "#15803d" }}>Delivered Revenue</div>
          <div style={{ ...kpiValueStyle, color: "#059669" }}>
            PKR {stats.revenue.toLocaleString()}
          </div>
          <div style={{ fontSize: "11px", color: "#15803d" }}>{stats.delivered} orders fulfilled</div>
        </div>
      </div>

      {/* Control Row: Search & Filters */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "14px",
          background: "#ffffff",
          padding: "16px 20px",
          borderRadius: "16px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
        }}
      >
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {["all", "pending", "new", "confirmed", "preparing", "ready", "out_for_delivery", "delivering", "arriving", "delivered", "completed", "cancelled"].map(
            (statusKey) => {
              const active = filterStatus === statusKey;
              return (
                <button
                  key={statusKey}
                  type="button"
                  onClick={() => setFilterStatus(statusKey)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: "10px",
                    border: active ? "none" : "1px solid #cbd5e1",
                    background: active ? "#059669" : "#ffffff",
                    color: active ? "#ffffff" : "#475569",
                    fontWeight: active ? 700 : 600,
                    fontSize: "12px",
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {statusKey.replace(/_/g, " ")}
                </button>
              );
            }
          )}
        </div>

        <div style={{ position: "relative", minWidth: "260px" }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Order #, customer, phone..."
            style={{
              width: "100%",
              padding: "8px 14px 8px 36px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              fontSize: "13px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <span
            style={{
              position: "absolute",
              left: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "#94a3b8",
            }}
          >
            🔍
          </span>
        </div>
      </div>

      {/* Success Notification */}
      {loadError && <p role="alert" style={{ margin: 0, padding: "10px 16px", border: "1px solid #fecaca", borderRadius: 12, background: "#fef2f2", color: "#991b1b", fontSize: 13 }}>{loadError}</p>}
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: "10px 16px",
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            color: "#065f46",
            borderRadius: "12px",
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          ✓ {message}
        </motion.div>
      )}

      {/* Orders List / Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
          Loading live orders database...
        </div>
      ) : filteredOrders.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "50px 20px",
            background: "#ffffff",
            borderRadius: "16px",
            border: "1px dashed #cbd5e1",
            color: "#64748b",
          }}
        >
          <div style={{ fontSize: "36px", marginBottom: "8px" }}>📦</div>
          <div style={{ fontWeight: 700, fontSize: "16px" }}>No orders found</div>
          <div style={{ fontSize: "12px", marginTop: "4px" }}>
            Orders placed via checkout, mobile app, or desktop POS will appear here live.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {filteredOrders.map((order) => {
            const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
            const isUpdating = updatingId === order.number;
            return (
              <div
                key={order.number}
                style={{
                  background: "#ffffff",
                  borderRadius: "16px",
                  border: "1px solid #e2e8f0",
                  padding: "18px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                }}
              >
                {/* Order Top Bar */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "10px",
                    borderBottom: "1px solid #f1f5f9",
                    paddingBottom: "10px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span
                      style={{
                        fontSize: "16px",
                        fontWeight: 800,
                        color: "#0f172a",
                        fontFamily: "Outfit, sans-serif",
                      }}
                    >
                      {order.number}
                    </span>
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: "9999px",
                        fontSize: "11px",
                        fontWeight: 800,
                        background: cfg.bg,
                        color: cfg.color,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <span>{cfg.icon}</span>
                      <span>{cfg.label}</span>
                    </span>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>
                      {new Date(order.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <Link href={`/admin/orders/${encodeURIComponent(order.number)}`} style={{ fontSize: "11px", color: "#059669", fontWeight: 700 }}>Open details →</Link>
                  </div>

                  {/* Status Dropdown Controller */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "#475569" }}>
                      Update Status:
                    </label>
                    <select
                      value={order.status}
                      disabled={isUpdating}
                      onChange={(e) =>
                        handleStatusChange(order.number, e.target.value as DbOrderStatus)
                      }
                      style={{
                        padding: "6px 12px",
                        borderRadius: "10px",
                        border: "1px solid #cbd5e1",
                        fontSize: "12px",
                        fontWeight: 700,
                        background: "#f8fafc",
                        color: "#0f172a",
                        cursor: "pointer",
                      }}
                    >
                      <option value="pending">⏳ Pending Prep</option>
                      <option value="preparing">🍳 Kitchen Cooking</option>
                      <option value="out_for_delivery">🛵 Out for Delivery</option>
                      <option value="delivered">✓ Delivered</option>
                      <option value="cancelled">✕ Cancelled</option>
                    </select>
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => void handleDeleteOrder(order.number)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "10px",
                        border: "1px solid #fecaca",
                        background: "#fff1f2",
                        color: "#b91c1c",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: isUpdating ? "not-allowed" : "pointer",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Customer Details & Items Row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    gap: "14px",
                  }}
                >
                  {/* Customer Info */}
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 800, color: "#1e293b" }}>
                      👤 {order.customerName}
                    </div>
                    <div style={{ fontSize: "12px", color: "#059669", fontWeight: 600 }}>
                      📞 {order.customerPhone}
                    </div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                      📍 {order.address}, {order.area}
                    </div>
                    {order.notes && (
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#b45309",
                          marginTop: "4px",
                          background: "#fef3c7",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          display: "inline-block",
                        }}
                      >
                        📝 {order.notes}
                      </div>
                    )}
                    {order.customerNote && <div style={{ marginTop: 6, padding: "6px 8px", borderRadius: 7, background: "#eff6ff", color: "#1e3a8a", fontSize: 11 }}><strong>Customer note:</strong> {order.customerNote}</div>}
                  </div>

                  {/* Items List */}
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>
                      Dishes Ordered:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      {order.items?.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            fontSize: "12px",
                            color: "#334155",
                            display: "flex",
                            justifyContent: "space-between",
                          }}
                        >
                          <span>
                            • {item.name} ({item.portion}) × {item.quantity}
                          </span>
                          <span style={{ fontWeight: 600, color: "#0f172a" }}>
                            PKR {(item.price * item.quantity).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pricing & Actions */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      alignItems: "flex-end",
                    }}
                  >
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>
                        Payment: <strong>{order.paymentMethod}</strong>
                      </div>
                      <div style={{ fontSize: "11px", color: order.paymentStatus === "paid" ? "#15803d" : "#b45309", fontWeight: 700 }}>
                        Payment status: {order.paymentStatus === "paid" ? "Paid" : order.paymentStatus === "verification_pending" ? "Process" : "Pending"}
                      </div>
                      <div
                        style={{
                          fontSize: "18px",
                          fontWeight: 800,
                          color: "#059669",
                          marginTop: "2px",
                        }}
                      >
                        PKR {order.total.toLocaleString()}
                      </div>
                      {order.paymentSlipUrl && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                          <a href={`/api/orders/proof?number=${encodeURIComponent(order.number)}`} target="_blank" rel="noreferrer"><img src={`/api/orders/proof?number=${encodeURIComponent(order.number)}`} alt="Uploaded payment slip" width={52} height={52} style={{ objectFit: "cover", borderRadius: 8 }} /></a>
                          <button type="button" onClick={() => void handlePaymentApproval(order)} disabled={isUpdating} style={{ padding: "6px 10px", border: 0, borderRadius: 8, background: "#059669", color: "white", fontSize: 11, fontWeight: 700 }}>Approve &amp; Mark Paid</button>
                        </div>
                      )}
                    </div>

                    {order.customerPhone.replace(/\D/g, "").length >= 10 && <a
                      href={`https://wa.me/${normalizeWhatsAppNumber(order.customerPhone)}?text=${encodeURIComponent(
                        `Hi ${order.customerName}, your Home Made Food order ${order.number} is ${cfg.label}. Payment: ${(order.paymentStatus || "pending").replace("_", " ")}. Total: PKR ${order.total.toLocaleString()}${order.riderName ? ` · Rider: ${order.riderName}${order.riderPhone ? ` (${order.riderPhone})` : ""}` : ""}\nTrack your order: https://www.homefood.engineer/track-order?order=${encodeURIComponent(order.number)}&phone=${encodeURIComponent(order.customerPhone)}`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: "6px 12px",
                        borderRadius: "8px",
                        background: "#25d366",
                        color: "#ffffff",
                        fontSize: "11px",
                        fontWeight: 700,
                        textDecoration: "none",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginTop: "8px",
                      }}
                    >
                      💬 Share order status on WhatsApp
                    </a>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const kpiCardStyle: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: "16px",
  padding: "16px 18px",
  border: "1px solid #e2e8f0",
  boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
};

const kpiLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.5px",
  color: "#64748b",
  textTransform: "uppercase",
  marginBottom: "4px",
};

const kpiValueStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 800,
  color: "#0f172a",
  fontFamily: "Outfit, sans-serif",
  lineHeight: 1.2,
  marginBottom: "4px",
};
