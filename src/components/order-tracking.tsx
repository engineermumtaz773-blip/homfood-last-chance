"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { readCustomerProfile, loadCustomerOrders, type OrderRequest } from "@/lib/customer";
import { whatsappUrl } from "@/lib/data";
import { getLiveOrderStatus, type LiveOrderStatus } from "@/lib/order-api";
import type { OrderMessage } from "@/lib/supabase-server";
import { useSiteSettings } from "@/components/site-settings";
import { broadcastRealtimeEvent, playAlertChime } from "@/lib/realtime-bus";
import { REALTIME_SYNC_EVENT } from "@/lib/realtime-client";
import type { StoreSettings } from "@/lib/store-db";
import { buildOrderWhatsAppMessage, getOrderWhatsAppNumber } from "@/lib/order-whatsapp";

const stageByStatus: Record<LiveOrderStatus["status"], number> = {
  new: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  delivering: 3,
  arriving: 3,
  completed: 4,
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
    title: "Order Confirmed",
    desc: "Confirmed by the Home Made Food kitchen",
    icon: "✓",
    subtext: "Your order is accepted",
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

const ORDER_CANCELLATION_WINDOW_SECONDS = 5 * 60;

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
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelReasonOther, setCancelReasonOther] = useState("");
  const [customerNoteDraft, setCustomerNoteDraft] = useState("");
  const [savingCustomerNote, setSavingCustomerNote] = useState(false);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [cancelSecondsLeft, setCancelSecondsLeft] = useState<number | null>(null);
  const liveOrderNumber = liveOrder?.number;
  const liveOrderCreatedAt = liveOrder?.created_at;
  const liveOrderStatusName = liveOrder?.status;
  const canCancelByStatus = liveOrderStatusName === "new" || liveOrderStatusName === "confirmed";
  const canCancel = canCancelByStatus && cancelSecondsLeft !== null && cancelSecondsLeft > 0;

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
          reason: cancelReason === "Other" ? cancelReasonOther : cancelReason,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; order?: { status?: string; cancellationReason?: string } };
      if (res.ok && data.ok) {
        setLiveOrder((prev) => (prev ? { ...prev, status: "cancelled", cancellationReason: data.order?.cancellationReason || (cancelReason === "Other" ? cancelReasonOther : cancelReason) || "Customer requested cancellation" } : null));
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
    const queryNumber = params.get("order") || params.get("id") || params.get("number") || "";
    const queryPhone = params.get("phone") || "";
    if (queryNumber || queryPhone) {
      const frame = window.requestAnimationFrame(() => {
        setOrderNumber(queryNumber);
        setPhone(queryPhone);
        setLookupTarget({ number: queryNumber, phone: queryPhone });
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hasDeepLink = Boolean(params.get("order") || params.get("id") || params.get("number") || params.get("phone"));
    let hasRecentOrder = false;
    try {
      hasRecentOrder = Boolean(window.localStorage.getItem("hmf_recent_order"));
    } catch (error) {
      console.warn("Could not check the recent order in local storage.", error);
    }
    const frame = window.requestAnimationFrame(() => {
      const savedPhone = readCustomerProfile()?.phone ?? "";
      if (savedPhone) setPhone((current) => current || savedPhone);
      if (!hasDeepLink) {
        try {
          const recent = JSON.parse(window.localStorage.getItem("hmf_recent_order") || "null") as { number?: string; phone?: string } | null;
          if (recent?.number) {
            setOrderNumber(recent.number);
            setPhone(recent.phone || savedPhone);
            setLookupTarget({ number: recent.number, phone: recent.phone || savedPhone });
          }
        } catch (error) {
          console.warn("Could not read the recent order from local storage.", error);
        }
      }
    });
    void loadCustomerOrders().then((customerOrders) => {
      setOrders(customerOrders);
      if (!hasDeepLink && !hasRecentOrder && customerOrders[0]) {
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
    let active = true;
    void fetch("/api/settings", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error(`Store settings request failed (${response.status}).`);
      const data = await response.json() as { settings?: StoreSettings };
      if (active && data.settings) setStoreSettings(data.settings);
    }).catch((error: unknown) => console.error("Could not load tracking store settings.", error));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!liveOrderNumber || !canCancelByStatus) {
      const frame = window.requestAnimationFrame(() => setCancelSecondsLeft(null));
      return () => window.cancelAnimationFrame(frame);
    }

    const createdAt = Date.parse(liveOrderCreatedAt || "");
    const updateCountdown = () => {
      const remaining = Number.isFinite(createdAt)
        ? Math.max(0, Math.ceil((createdAt + ORDER_CANCELLATION_WINDOW_SECONDS * 1000 - Date.now()) / 1000))
        : 0;
      setCancelSecondsLeft(remaining);
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [liveOrderNumber, liveOrderCreatedAt, liveOrderStatusName, canCancelByStatus]);

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
        if (!messagesResponse.ok) throw new Error(`Order messages could not be loaded (HTTP ${messagesResponse.status}).`);
        const messageData = await messagesResponse.json() as { messages?: OrderMessage[] };
        if (Array.isArray(messageData.messages)) setMessages(messageData.messages);
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

  async function copyOrderMessage() {
    try {
      await navigator.clipboard.writeText(orderWhatsAppMessage);
      setCopyMessage("Order message copied.");
    } catch (error) {
      console.error("Could not copy the WhatsApp order message.", error);
      setCopyMessage("Copy was blocked. Try the WhatsApp link instead.");
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
      const data = await response.json() as { message?: OrderMessage; warnings?: string[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Message could not be sent.");
      if (data.message) {
        setMessages((current) => [...current, data.message as OrderMessage]);
        playAlertChime("pop");
        broadcastRealtimeEvent({
          type: "chat_message",
          orderNumber: lookupTarget.number,
          message: body,
        });
      }
      if (data.warnings?.length) setLookupError(data.warnings.join(" "));
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
    if (!number && !normalizedPhone) {
      setLookupError("Enter an order number or the phone number used at checkout.");
      return;
    }
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
  const orderWhatsAppMessage = liveOrder ? buildOrderWhatsAppMessage(liveOrder, storeSettings || undefined) : "";

  return (
    <MotionConfig reducedMotion="user">
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
                Payment: {liveOrder.paymentMethod} · {(liveOrder.paymentStatus || "pending").replace("_", " ")}
              </div>
              <div className="tracking-order-summary">
                <strong>Order summary</strong>
                {liveOrder.items.map((item, index) => <div key={`${item.id}-${item.portion}-${index}`}><span>{item.name} · {item.portion} × {item.quantity}</span><b>Rs. {(item.price * item.quantity).toLocaleString("en-PK")}</b></div>)}
                <div><span>Subtotal</span><b>Rs. {liveOrder.subtotal.toLocaleString("en-PK")}</b></div>
                {liveOrder.discount > 0 && <div><span>Discount</span><b>− Rs. {liveOrder.discount.toLocaleString("en-PK")}</b></div>}
                <div><span>Delivery</span><b>Rs. {liveOrder.deliveryFee.toLocaleString("en-PK")}</b></div>
                <div className="tracking-order-total"><span>Total</span><b>Rs. {liveOrder.total.toLocaleString("en-PK")}</b></div>
                <small>{liveOrder.address}{liveOrder.area ? `, ${liveOrder.area}` : ""}</small>
              </div>
              {liveOrder.paymentSlipUrl && lookupTarget && <a className="tracking-payment-slip" href={`/api/orders/slip?${new URLSearchParams({ number: liveOrder.number, phone: lookupTarget.phone })}`} target="_blank" rel="noreferrer">View uploaded payment slip · {liveOrder.paymentSlipName || "Receipt"}</a>}
              <p className="tracking-rider-info">Rider: <strong>{liveOrder.riderName || "Assignment pending"}</strong>{liveOrder.riderPhone && <> · <a href={`tel:${liveOrder.riderPhone}`}>{liveOrder.riderPhone}</a></>}{liveOrder.estimatedDelivery && <> · Estimated delivery: {liveOrder.estimatedDelivery}</>}</p>
              {isCancelled && <p className="tracking-cancelled-note">This order has been cancelled{liveOrder.cancellationReason ? `: ${liveOrder.cancellationReason}` : "."}</p>}
              {liveOrder.adminNotes && <p style={{ margin: "10px 0 0", color: "#334155", fontSize: 12 }}>Kitchen note: {liveOrder.adminNotes}</p>}
              {liveOrder.adminMediaUrl && <video controls playsInline preload="metadata" src={liveOrder.adminMediaUrl} style={{ display: "block", width: "min(100%, 480px)", maxHeight: 280, marginTop: 10, borderRadius: 12, background: "#111" }}>Your browser does not support video playback.</video>}
              <div className="tracking-whatsapp-actions">
                <a href={whatsappUrl(orderWhatsAppMessage, getOrderWhatsAppNumber(storeSettings || undefined))} target="_blank" rel="noreferrer">Confirm / discuss this order on WhatsApp</a>
                <button type="button" onClick={() => void copyOrderMessage()}>Copy order message</button>
                {copyMessage && <small role="status">{copyMessage}</small>}
              </div>
              <form onSubmit={saveCustomerNote} style={{ display: "grid", gap: 8, marginTop: 12 }}>
                <label htmlFor="delivery-note" style={{ fontSize: 12, fontWeight: 700 }}>Delivery or cooking note</label>
                <textarea id="delivery-note" value={customerNoteDraft} maxLength={500} onChange={(event) => setCustomerNoteDraft(event.target.value)} placeholder="Add a note for the kitchen or delivery team" style={{ width: "100%", minHeight: 72, resize: "vertical", padding: 10, border: "1px solid #d8e2dc", borderRadius: 10, font: "inherit" }} />
                <button type="submit" disabled={savingCustomerNote} style={{ justifySelf: "start", padding: "8px 12px", border: 0, borderRadius: 8, background: "#176b47", color: "white", fontWeight: 700 }}>{savingCustomerNote ? "Saving…" : "Save note"}</button>
              </form>

              {canCancel && <div className="tracking-cancel-area"><motion.span key={cancelSecondsLeft} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.12 }}>Cancel available for {Math.floor((cancelSecondsLeft ?? 0) / 60).toString().padStart(2, "0")}:{((cancelSecondsLeft ?? 0) % 60).toString().padStart(2, "0")}</motion.span><motion.button type="button" whileTap={{ scale: 0.98 }} onClick={() => setShowCancelConfirm(true)}>Cancel Order</motion.button></div>}
              {canCancelByStatus && cancelSecondsLeft === 0 && <p className="tracking-cancel-locked">The 5-minute cancellation window has expired. Contact the kitchen if you need help.</p>}
              {liveOrder.status === "preparing" || liveOrder.status === "ready" || liveOrder.status === "delivering" || liveOrder.status === "arriving" || liveOrder.status === "completed" ? <p className="tracking-cancel-locked">Cancellation is locked because preparation or delivery has started.</p> : null}
              <AnimatePresence>
                {showCancelConfirm && canCancel && <motion.div className="tracking-cancel-backdrop" role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget && !cancelling) setShowCancelConfirm(false); }}>
                  <motion.section className="tracking-cancel-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-order-title" initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }} transition={{ type: "spring", stiffness: 280, damping: 24 }}>
                    <h3 id="cancel-order-title">Cancel this order?</h3><p>This action will be sent to the kitchen immediately. You can optionally tell us why.</p>
                    <label htmlFor="cancel-reason">Reason (optional)</label><select id="cancel-reason" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)}><option value="">Choose a reason</option><option>Ordered by mistake</option><option>Changed delivery time</option><option>Wrong address or item</option><option>Other</option></select>
                    {cancelReason === "Other" && <textarea aria-label="Other cancellation reason" maxLength={500} value={cancelReasonOther} placeholder="Share an optional reason" onChange={(event) => setCancelReasonOther(event.target.value)} />}
                    <div><button type="button" disabled={cancelling} onClick={() => void handleCancelOrder()}>{cancelling ? "Cancelling…" : "Yes, cancel order"}</button><button type="button" disabled={cancelling} onClick={() => setShowCancelConfirm(false)}>Keep order</button></div>
                  </motion.section>
                </motion.div>}
              </AnimatePresence>
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
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.045 }}
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
              {liveOrder?.riderName || "Rider assignment pending"}
              </strong>
              <span style={{ fontSize: "12px", color: "#64748b", display: "block" }}>
                Estimated delivery: <strong>{liveOrder?.estimatedDelivery || "To be confirmed"}</strong> · Bahawalpur
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
              href={`tel:${liveOrder?.riderPhone || storeSettings?.restaurant.phone || "03096648932"}`}
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
              {liveOrder?.riderPhone ? "📞 Call Rider" : "📞 Call Kitchen"}
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
              placeholder="Order number or leave blank to search by phone"
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
              placeholder="03xx xxxxxxx"
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
          {lookupError.toLowerCase().includes("order not found") && <p className="tracking-not-found"><strong>Order not found</strong><span>Check the spelling of your order number and the phone used at checkout, or try your phone number by itself.</span></p>}
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
    </MotionConfig>
  );
}
