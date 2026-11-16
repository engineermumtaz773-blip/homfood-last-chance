"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { DbOrder, DbOrderStatus } from "@/lib/store-db";
import type { OrderMessage } from "@/lib/supabase-server";

const statuses: Array<{ value: DbOrderStatus; label: string }> = [
  { value: "pending", label: "New" },
  { value: "preparing", label: "Preparing" },
  { value: "out_for_delivery", label: "Ready / Out for delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

export function AdminOrderDetail({ number }: { number: string }) {
  const [order, setOrder] = useState<DbOrder | null>(null);
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<DbOrderStatus>("pending");
  const [error, setError] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [adminMediaUrl, setAdminMediaUrl] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const [orderResponse, messageResponse] = await Promise.all([
        fetch(`/api/orders?number=${encodeURIComponent(number)}`, { cache: "no-store" }),
        fetch(`/api/order-messages?number=${encodeURIComponent(number)}`, { cache: "no-store" }),
      ]);
      if (!active) return;
      if (orderResponse.ok) {
        const data = await orderResponse.json() as { order?: DbOrder };
        if (data.order) {
          setOrder(data.order);
          setStatus(data.order.status);
          setAdminNotes(data.order.adminNotes || "");
          setAdminMediaUrl(data.order.adminMediaUrl || "");
        }
      }
      if (messageResponse.ok) {
        const data = await messageResponse.json() as { messages?: OrderMessage[] };
        if (Array.isArray(data.messages)) setMessages(data.messages);
      }
    }
    void load();
    const timer = window.setInterval(load, 3500);
    return () => { active = false; window.clearInterval(timer); };
  }, [number]);

  async function updateStatus(nextStatus: DbOrderStatus) {
    setStatus(nextStatus);
    const response = await fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number, status: nextStatus }),
    });
    if (!response.ok) setError("Status could not be saved.");
    else {
      const data = await response.json() as { order?: DbOrder };
      if (data.order) setOrder(data.order);
    }
  }

  async function sendReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    const response = await fetch("/api/order-messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number, sender: "admin", body }),
    });
    if (!response.ok) {
      setError("Reply could not be sent.");
      return;
    }

    const data = await response.json() as { message?: OrderMessage };
    if (data.message) setMessages((current) => [...current, data.message as OrderMessage]);
    setText("");
  }

  async function saveOrderInstructions() {
    const response = await fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number, status, adminNotes, adminMediaUrl }),
    });
    if (!response.ok) setError("Order instructions could not be saved.");
  }

  if (!order) return <div className="admin-order-detail"><p>Loading order {number}…</p>{error && <p className="form-error">{error}</p>}</div>;

  return (
    <motion.div className="admin-order-detail" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="admin-detail-toolbar"><Link href="/admin/orders">← All orders</Link><span>Live sync enabled</span></div>
      <div className="admin-detail-grid">
        <section className="admin-detail-panel">
          <span className="store-eyebrow">ORDER DETAILS</span><h1>{order.number}</h1>
          <p><strong>{order.customerName}</strong> · {order.customerPhone}</p><p>{order.address}, {order.area}</p>
          <div className="admin-status-actions">{statuses.map((item) => <button key={item.value} type="button" className={status === item.value ? "active" : ""} onClick={() => void updateStatus(item.value)}>{item.label}</button>)}</div>
          <div className="admin-detail-items">{order.items.map((item, index) => <div key={`${item.id}-${index}`}><span>{item.name} · {item.portion} × {item.quantity}</span><strong>PKR {(item.price * item.quantity).toLocaleString()}</strong></div>)}</div>
          <strong className="admin-detail-total">Total PKR {order.total.toLocaleString()}</strong>
          <label className="field">Admin note<textarea value={adminNotes} onChange={(event) => setAdminNotes(event.target.value)} maxLength={1000} placeholder="Kitchen or delivery instruction for the customer" /></label>
          <label className="field">Instruction video/media URL<input value={adminMediaUrl} onChange={(event) => setAdminMediaUrl(event.target.value)} type="url" placeholder="https://..." /></label>
          <button type="button" className="add-button" onClick={() => void saveOrderInstructions()}>Save customer instructions</button>
          {order.paymentSlipUrl && <a href={order.paymentSlipUrl} target="_blank" rel="noreferrer">View Uploaded File ({order.paymentSlipName || "payment slip"})</a>}
        </section>
        <section className="admin-detail-panel admin-detail-chat">
          <div className="tracking-map-heading"><div><span className="store-eyebrow">CUSTOMER SUPPORT</span><strong>Order chat</strong></div><span className="chat-secure-badge">#{messages.length}</span></div>
          <div className="order-chat-messages">{messages.length ? messages.map((message) => <div key={message.id} className={`order-chat-message ${message.sender}`}><span>{message.body}</span><small>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div>) : <p>No customer messages yet.</p>}</div>
          <form className="order-chat-form" onSubmit={sendReply}><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Reply to customer..." maxLength={1000} /><button type="submit" disabled={!text.trim()}>Reply</button></form>
          {error && <p className="form-error">{error}</p>}
        </section>
      </div>
    </motion.div>
  );
}
