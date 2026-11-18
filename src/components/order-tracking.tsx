"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { motion } from "framer-motion";
import { readCustomerProfile, loadCustomerOrders, type OrderRequest } from "@/lib/customer";
import { whatsappUrl } from "@/lib/data";
import { getLiveOrderStatus, type LiveOrderStatus } from "@/lib/order-api";
import type { OrderMessage } from "@/lib/supabase-server";
import { useSiteSettings } from "@/components/site-settings";
import { broadcastRealtimeEvent, playAlertChime } from "@/lib/realtime-bus";
import { REALTIME_SYNC_EVENT } from "@/lib/realtime-client";

const stageByStatus: Record<LiveOrderStatus["status"], number> = {
  new: 0,
  preparing: 1,
  ready: 2,
  delivering: 2,
  arriving: 3,
  completed: 3,
  cancelled: -1,
};

const STAGE_DETAILS = [
  {
    title: "Order Placed",
    desc: "Received by Home Made Food kitchen",
    icon: "📝",
    subtext: "Order details verified & queued",
  },
  {
    title: "Cooking & Preparing",
    desc: "Fresh homemade food on the stove",
    icon: "🍳",
    subtext: "Piping hot & made with love in Bahawalpur",
  },
  {
    title: "Out for Delivery",
    desc: "Rider dispatched with insulated thermal bag",
    icon: "🛵",
    subtext: "On the way to your delivery address",
  },
  {
    title: "Delivered",
    desc: "Enjoy your fresh homemade meal",
    icon: "🍽️",
    subtext: "Delivered fresh & warm",
  },
];

export function OrderTracking() {
  const { t } = useSiteSettings();
  const [orders, setOrders] = useState<OrderRequest[]>([]);
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [lookupTarget, setLookupTarget] = useState<{ number: string; phone: string } | null>(null);
  const [liveOrder, setLiveOrder] = useState<LiveOrderStatus | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [cancellationSecondsLeft, setCancellationSecondsLeft] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState("Placed by mistake");
  const [customerNoteDraft, setCustomerNoteDraft] = useState("");
  const [savingCustomerNote, setSavingCustomerNote] = useState(false);

  // Calculate 2-minute cancellation timer for active order
  useEffect(() => {
    if (!liveOrder || liveOrder.status === "cancelled" || liveOrder.status === "completed" || liveOrder.status === "arriving") {
      const frame = window.requestAnimationFrame(() => setCancellationSecondsLeft(null));
      return () => window.cancelAnimationFrame(frame);
    }

    const createdTime = new Date(liveOrder.created_at || liveOrder.updated_at || Date.now()).getTime();

    const updateCountdown = () => {
      const elapsedSeconds = Math.floor((Date.now() - createdTime) / 1000);
      const remaining = Math.max(0, 120 - elapsedSeconds);
      setCancellationSecondsLeft(remaining);
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [liveOrder]);

  async function handleCancelOrder() {
    if (!liveOrder || cancelling) return;
    setCancelling(true);
    setLookupError("");
    try {
      const res = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: liveOrder.number,
          phone: lookupTarget?.phone || phone,
          reason: cancelReason,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setLiveOrder((prev) => (prev ? { ...prev, status: "cancelled" } : null));
        setShowCancelConfirm(false);
        playAlertChime("alert");
        broadcastRealtimeEvent({
          type: "order_cancelled",
          orderNumber: liveOrder.number,
          message: `Customer cancelled order ${liveOrder.number}: "${cancelReason}"`,
        });
      } else {
        throw new Error(data.error || "Failed to cancel order");
      }
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : "Cancellation failed.");
    } finally {
      setCancelling(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryNumber = params.get("id") || params.get("number");
    if (queryNumber) {
      const frame = window.requestAnimationFrame(() => {
        setOrderNumber(queryNumber);
        setLookupTarget({ number: queryNumber, phone: params.get("phone") || "" });
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const savedOrders = [] as OrderRequest[];
      const savedPhone = readCustomerProfile()?.phone ?? "";
      setOrders(savedOrders);
      setPhone(savedPhone);
      if (savedOrders[0]) {
        setOrderNumber(savedOrders[0].number);
        setLookupTarget({ number: savedOrders[0].number, phone: savedPhone });
      }
    });
    void loadCustomerOrders().then((customerOrders) => {
      setOrders(customerOrders);
      if (customerOrders[0]) {
        const customerPhone = readCustomerProfile()?.phone ?? "";
        setPhone(customerPhone);
        setOrderNumber(customerOrders[0].number);
        setLookupTarget({ number: customerOrders[0].number, phone: customerPhone });
      }
    }).catch((error: unknown) => {
      if (error instanceof Error && !error.message.includes("401")) console.error("Could not load orders from Supabase.", error);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const target = lookupTarget;
    if (!target) return;
    const targetNumber = target.number;
    const targetPhone = target.phone;
    let active = true;

    async function refreshStatus() {
      setIsRefreshing(true);
      try {
        const status = await getLiveOrderStatus(targetNumber, targetPhone);
        if (!active) return;
        setLiveOrder(status);
        const messagesResponse = await fetch(`/api/order-messages?number=${encodeURIComponent(targetNumber)}&phone=${encodeURIComponent(targetPhone)}`, { cache: "no-store" });
        if (messagesResponse.ok) {
          const messageData = await messagesResponse.json() as { messages?: OrderMessage[] };
          if (Array.isArray(messageData.messages)) setMessages(messageData.messages);
        }
        setLookupError("");
      } catch (error) {
        if (!active) return;
        console.warn("Could not retrieve live order status:", error);
        setLookupError(
          error instanceof Error ? error.message : "The live tracking service could not be reached."
        );
      } finally {
        if (active) setIsRefreshing(false);
      }
    }

    void refreshStatus();
    // 3.5s poll for real-time live synchronization
    const interval = window.setInterval(() => {
      void refreshStatus();
    }, 3500);
    const onRealtime = (event: Event) => {
      const detail = (event as CustomEvent<{ table?: string }>).detail;
      if (detail?.table === "orders" || detail?.table === "order_messages") void refreshStatus();
    };
    window.addEventListener(REALTIME_SYNC_EVENT, onRealtime);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener(REALTIME_SYNC_EVENT, onRealtime);
    };
  }, [lookupTarget]);

  useEffect(() => {
    const resetFrame = window.requestAnimationFrame(() => setCustomerNoteDraft(liveOrder?.customerNote || ""));
    return () => window.cancelAnimationFrame(resetFrame);
  }, [liveOrder?.number, liveOrder?.customerNote]);

  async function saveCustomerNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lookupTarget || savingCustomerNote) return;
    setSavingCustomerNote(true);
    try {
      const response = await fetch("/api/orders/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: lookupTarget.number, phone: lookupTarget.phone, note: customerNoteDraft }),
      });
      const data = await response.json() as { error?: string; order?: { customerNote?: string } };
      if (!response.ok) throw new Error(data.error || "Could not save the delivery note.");
      setLiveOrder((current) => current ? { ...current, customerNote: data.order?.customerNote || customerNoteDraft } : current);
      setLookupError("");
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : "Could not save the delivery note.");
    } finally {
      setSavingCustomerNote(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = chatText.trim();
    if (!lookupTarget || !body || chatSending) return;
    setChatSending(true);
    try {
      const response = await fetch("/api/order-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: lookupTarget.number, phone: lookupTarget.phone, sender: "customer", body }),
      });
      if (!response.ok) throw new Error("Message could not be sent.");
      const data = await response.json() as { message?: OrderMessage };
      if (data.message) {
        setMessages((current) => [...current, data.message as OrderMessage]);
        playAlertChime("pop");
        broadcastRealtimeEvent({
          type: "chat_message",
          orderNumber: lookupTarget.number,
          message: body,
        });
      }
      setChatText("");
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : "Message could not be sent.");
    } finally {
      setChatSending(false);
    }
  }

  function lookupOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const number = orderNumber.trim().toUpperCase();
    const normalizedPhone = phone.trim();
    if (!number) return;
    setLookupError("");
    setLookupTarget({ number, phone: normalizedPhone });
  }

  const handleSelectRecentOrder = (o: OrderRequest) => {
    setOrderNumber(o.number);
    setLookupTarget({ number: o.number, phone: phone.trim() });
  };

  const orderStatus = liveOrder?.status;
  const activeStage = orderStatus !== undefined ? stageByStatus[orderStatus] : orders.length ? 0 : 0;
  const isCancelled = orderStatus === "cancelled";

  return (
    <div className="tracking-layout" style={{ maxWidth: "1140px", margin: "0 auto" }}>
      {/* Main Tracking Card */}
      <motion.section
        className="tracking-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{
          boxShadow: "0 10px 40px rgba(0,0,0,0.06)",
          borderRadius: "24px",
          border: "1px solid #e2e8f0",
          background: "#ffffff",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div className="tracking-status-heading">
          <span className="tracking-status-icon" aria-hidden="true">
            📍
          </span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="store-eyebrow">LIVE ORDER TRACKER</span>
              {isRefreshing && (
                <span
                  style={{
                    fontSize: "10px",
                    color: "#059669",
                    background: "#ecfdf5",
                    padding: "2px 8px",
                    borderRadius: "9999px",
                    fontWeight: 700,
                  }}
                >
                  ● Syncing...
                </span>
              )}
            </div>
            <h2>We&apos;ll keep you in the loop</h2>
          </div>
        </div>

        <p className="tracking-disclaimer">
          Live status refreshes in real-time from the kitchen. Delivery timing and rider details
          are dynamically confirmed.
        </p>

        {/* Recent Orders Pills */}
        {orders.length > 0 && (
          <div style={{ margin: "14px 0", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 700 }}>Recent Orders:</span>
            {orders.slice(0, 4).map((o) => {
              const isSelected = lookupTarget?.number.toUpperCase() === o.number.toUpperCase();
              return (
                <button
                  key={o.number}
                  type="button"
                  onClick={() => handleSelectRecentOrder(o)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "8px",
                    border: isSelected ? "1.5px solid #059669" : "1px solid #cbd5e1",
                    background: isSelected ? "#ecfdf5" : "#f8fafc",
                    color: isSelected ? "#059669" : "#334155",
                    fontSize: "11px",
                    fontWeight: isSelected ? 800 : 600,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {o.number}
                </button>
              );
            })}
          </div>
        )}

        {/* Live Status Highlight Box */}
        {liveOrder && (
          <motion.div
            initial={{ scale: 0.98, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`live-order-status ${isCancelled ? "cancelled" : ""}`}
            style={{
              borderRadius: "16px",
              padding: "16px 20px",
              background: isCancelled
                ? "#fee2e2"
                : "linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)",
              border: isCancelled ? "1px solid #fecaca" : "1px solid #a7f3d0",
              boxShadow: "0 4px 16px rgba(5, 150, 105, 0.08)",
            }}
          >
            <span
              className="live-status-pulse"
              style={{
                background: isCancelled ? "#ef4444" : "#10b981",
                boxShadow: isCancelled ? "0 0 12px #ef4444" : "0 0 12px #10b981",
              }}
            />
            <div>
              <strong style={{ fontSize: "16px", color: isCancelled ? "#b91c1c" : "#065f46" }}>
                {isCancelled
                  ? "Order Cancelled"
                  : activeStage === 0
                  ? "Order Received & Queued"
                  : activeStage === 1
                  ? "Cooking in Fresh Kitchen"
                  : activeStage === 2
                  ? "Out for Delivery · Bahawalpur"
                  : "Delivered & Completed"}
              </strong>
              <div style={{ fontSize: "12px", color: "#475569", marginTop: "3px" }}>
                Order <strong>{liveOrder.number}</strong> · PKR {liveOrder.total.toLocaleString()} · Updated{" "}
                {new Date(liveOrder.updated_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: liveOrder.paymentStatus === "paid" ? "#15803d" : "#b45309" }}>
                Payment: {(liveOrder.paymentStatus || "pending").replace("_", " ")}
              </div>
              {liveOrder.adminNotes && <p style={{ margin: "10px 0 0", color: "#334155", fontSize: 12 }}>Kitchen note: {liveOrder.adminNotes}</p>}
              {liveOrder.adminMediaUrl && <video controls playsInline preload="metadata" src={liveOrder.adminMediaUrl} style={{ display: "block", width: "min(100%, 480px)", maxHeight: 280, marginTop: 10, borderRadius: 12, background: "#111" }}>Your browser does not support video playback.</video>}
              <form onSubmit={saveCustomerNote} style={{ display: "grid", gap: 8, marginTop: 12 }}>
                <label htmlFor="delivery-note" style={{ fontSize: 12, fontWeight: 700 }}>Delivery or cooking note</label>
                <textarea id="delivery-note" value={customerNoteDraft} maxLength={500} onChange={(event) => setCustomerNoteDraft(event.target.value)} placeholder="Add a note for the kitchen or delivery team" style={{ width: "100%", minHeight: 72, resize: "vertical", padding: 10, border: "1px solid #d8e2dc", borderRadius: 10, font: "inherit" }} />
                <button type="submit" disabled={savingCustomerNote} style={{ justifySelf: "start", padding: "8px 12px", border: 0, borderRadius: 8, background: "#176b47", color: "white", fontWeight: 700 }}>{savingCustomerNote ? "Saving…" : "Save note"}</button>
              </form>

              {/* 2-Minute Order Cancellation Action */}
              {!isCancelled && cancellationSecondsLeft !== null && cancellationSecondsLeft > 0 && (
                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed rgba(0,0,0,0.1)" }}>
                  {!showCancelConfirm ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ animation: "pulse 1.2s infinite", color: "#d97706", fontSize: "14px" }}>⏱️</span>
                        <span style={{ fontSize: "12px", color: "#475569" }}>
                          Cancel window active: <strong>{Math.floor(cancellationSecondsLeft / 60)}:{(cancellationSecondsLeft % 60).toString().padStart(2, "0")}</strong>
                        </span>
                      </div>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowCancelConfirm(true)}
                        style={{
                          padding: "6px 14px",
                          borderRadius: "8px",
                          background: "#fef2f2",
                          border: "1px solid #fecaca",
                          color: "#dc2626",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Cancel Order
                      </motion.button>
                    </div>
                  ) : (
                    <div style={{ background: "#fff", padding: "12px", borderRadius: "10px", border: "1px solid #fecaca", display: "grid", gap: "8px", marginTop: "6px" }}>
                      <strong style={{ fontSize: "13px", color: "#991b1b" }}>Confirm Order Cancellation?</strong>
                      <select
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        style={{ padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px" }}
                      >
                        <option value="Placed by mistake">Placed by mistake</option>
                        <option value="Need to change delivery address">Need to change delivery address</option>
                        <option value="Duplicate order placed">Duplicate order placed</option>
                        <option value="Delivery time too long">Delivery time too long</option>
                      </select>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => void handleCancelOrder()}
                          disabled={cancelling}
                          style={{ padding: "6px 12px", borderRadius: "6px", background: "#dc2626", color: "#fff", border: "none", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                        >
                          {cancelling ? "Cancelling..." : "Yes, Cancel Order"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCancelConfirm(false)}
                          style={{ padding: "6px 12px", borderRadius: "6px", background: "#f1f5f9", color: "#475569", border: "none", fontSize: "12px", cursor: "pointer" }}
                        >
                          Keep Order
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {lookupError && (
          <p className="tracking-error" role="alert" style={{ marginTop: "12px" }}>
            {lookupError}
          </p>
        )}

        {/* 4-Step Interactive Timeline */}
        <div
          className="tracking-timeline"
          aria-label="Order progress stages"
          style={{
            margin: "24px 0",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: "12px",
          }}
        >
          {STAGE_DETAILS.map((stg, index) => {
            const isCompleted = index < activeStage;
            const isCurrent = index === activeStage;
            return (
              <motion.div
                key={stg.title}
                whileHover={{ y: -3 }}
                style={{
                  padding: "14px",
                  borderRadius: "16px",
                  border: isCurrent
                    ? "2px solid #059669"
                    : isCompleted
                    ? "1px solid #a7f3d0"
                    : "1px solid #f1f5f9",
                  background: isCurrent
                    ? "#f0fdf4"
                    : isCompleted
                    ? "#ffffff"
                    : "#f8fafc",
                  boxShadow: isCurrent ? "0 4px 16px rgba(5, 150, 105, 0.15)" : "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  position: "relative",
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "20px" }}>{stg.icon}</span>
                  <span
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      background: isCompleted || isCurrent ? "#059669" : "#cbd5e1",
                      color: "#ffffff",
                      fontSize: "11px",
                      fontWeight: 800,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isCompleted ? "✓" : index + 1}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: isCurrent ? 800 : 700,
                    color: isCurrent ? "#065f46" : isCompleted ? "#0f172a" : "#94a3b8",
                  }}
                >
                  {stg.title}
                </div>
                <div style={{ fontSize: "11px", color: "#64748b", lineHeight: 1.3 }}>
                  {stg.desc}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Assigned Rider & Delivery Details */}
        <div
          className="tracking-rider"
          style={{
            background: "#f8fafc",
            borderRadius: "16px",
            border: "1px solid #e2e8f0",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span
              className="tracking-rider-avatar"
              aria-hidden="true"
              style={{
                background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
                color: "#ffffff",
                fontSize: "18px",
                boxShadow: "0 4px 12px rgba(5, 150, 105, 0.3)",
              }}
            >
              🛵
            </span>
            <div>
              <strong style={{ fontSize: "14px", color: "#0f172a" }}>
                {liveOrder?.riderName || "Mumtaz Express Rider"}
              </strong>
              <span style={{ fontSize: "12px", color: "#64748b", display: "block" }}>
                Estimated delivery: <strong>25–35 mins</strong> · Bahawalpur Express
              </span>
            </div>

            {liveOrder && (
              <div className="tracking-map-card">
                <div className="tracking-map-heading"><div><span className="store-eyebrow">LIVE DELIVERY MAP</span><strong>Bahawalpur route</strong></div><span className="map-live-badge">● Live</span></div>
                <div className="tracking-map">
                  <iframe title="Bahawalpur delivery map" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=71.480%2C29.350%2C71.720%2C29.430&layer=mapnik" />
                  <motion.div className="map-rider-pin" animate={{ left: `${Math.min(78, Math.max(18, 22 + activeStage * 18))}%`, top: `${Math.max(28, 62 - activeStage * 11)}%` }} transition={{ type: "spring", stiffness: 70, damping: 16 }}>🛵</motion.div>
                  <div className="map-restaurant-pin">🍽️</div><div className="map-destination-pin">📍</div>
                </div>
                <div className="tracking-map-legend"><span>🍽️ Kitchen · Goheer Town</span><span>📍 Delivery address</span></div>
              </div>
            )}

            {lookupTarget && (
              <motion.section className="order-chat-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <div className="tracking-map-heading"><div><span className="store-eyebrow">ORDER SUPPORT</span><strong>Chat with the kitchen</strong></div><span className="chat-secure-badge">Order-only</span></div>
                <div className="order-chat-messages" aria-live="polite">
                  {messages.length ? messages.map((message) => <div key={message.id} className={`order-chat-message ${message.sender}`}><span>{message.body}</span><small>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div>) : <p>No messages yet. Ask the kitchen about this order.</p>}
                </div>
                <form className="order-chat-form" onSubmit={sendMessage}><input value={chatText} onChange={(event) => setChatText(event.target.value)} maxLength={1000} placeholder="Message the kitchen..." aria-label="Message the kitchen" /><button type="submit" disabled={chatSending || !chatText.trim()}>{chatSending ? "Sending…" : "Send"}</button></form>
              </motion.section>
            )}
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <a
              href={`tel:${liveOrder?.riderPhone || "03096648932"}`}
              style={{
                padding: "8px 14px",
                borderRadius: "10px",
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                color: "#0f172a",
                fontSize: "12px",
                fontWeight: 700,
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              📞 Call Rider
            </a>
            <a
              href={whatsappUrl(
                `Hi, I am tracking my Home Made Food order ${orderNumber.trim() || "#HMF-0000"}. Please share rider location.`
              )}
              target="_blank"
              rel="noreferrer"
              style={{
                padding: "8px 14px",
                borderRadius: "10px",
                background: "#25d366",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: 700,
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              💬 WhatsApp
            </a>
          </div>
        </div>
      </motion.section>

      {/* Side Lookup Panel */}
      <aside className="tracking-side">
        <form className="form-card tracking-form" onSubmit={lookupOrder} style={{ borderRadius: "20px" }}>
          <span className="store-eyebrow">{t("trackKicker")}</span>
          <h2>{t("trackTitle")}</h2>
          <label className="field">
            {t("orderNumber")}
            <input
              name="order"
              value={orderNumber}
              onChange={(event) => setOrderNumber(event.target.value)}
              required
              placeholder="e.g. #HMF-1234"
              style={{ borderRadius: "10px" }}
            />
          </label>
          <label className="field">
            {t("phoneUsed")}
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="03xx xxxxxxx (optional)"
              style={{ borderRadius: "10px" }}
            />
          </label>
          <motion.button
            className="add-button"
            type="submit"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{
              background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
              color: "#ffffff",
              border: "none",
              borderRadius: "12px",
              padding: "12px",
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(5, 150, 105, 0.3)",
            }}
          >
            {t("checkStatus")}
          </motion.button>
          {orderNumber && (
            <a
              className="tracking-whatsapp-link"
              href={whatsappUrl(
                `Hi Home Made Food, please check the status of order ${orderNumber.trim()}. My phone number is ${phone.trim()}.`
              )}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: "12px", fontWeight: 700, color: "#059669" }}
            >
              Ask our team on WhatsApp ↗
            </a>
          )}
          {lookupTarget && !liveOrder && !lookupError && (
            <span className="tracking-loading">Checking the latest order status…</span>
          )}
        </form>

        <div className="tracking-contact" style={{ borderRadius: "16px", marginTop: "16px" }}>
          <strong>Talk to us directly</strong>
          <a href="tel:03096648932">Call 0309 6648932</a>
          <a
            href={whatsappUrl("Hi Home Made Food, I need an order update.")}
            target="_blank"
            rel="noreferrer"
          >
            Chat with the kitchen ↗
          </a>
        </div>
      </aside>
    </div>
  );
}
