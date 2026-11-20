"use client";

import { useCallback, useEffect, useState } from "react";

type ScheduledOrder = { id: string; slot_time: string; order_number?: string | null; status: string };

export function ScheduledOrdersManager() {
  const [orders, setOrders] = useState<ScheduledOrder[]>([]);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/schedule", { cache: "no-store" });
    if (response.status === 401) return [];
    const data = await response.json() as { scheduledOrders?: ScheduledOrder[]; error?: string };
    if (!response.ok) throw new Error(data.error || "Scheduled orders could not be loaded.");
    return Array.isArray(data.scheduledOrders) ? data.scheduledOrders : [];
  }, []);

  useEffect(() => {
    let active = true;
    void load().then((scheduledOrders) => {
      if (active) setOrders(scheduledOrders);
    }).catch((error: unknown) => {
      console.error("Could not load scheduled orders.", error);
      if (active) setMessage(error instanceof Error ? error.message : "Scheduled orders could not be loaded.");
    });
    return () => { active = false; };
  }, [load]);

  async function cancel(id: string) {
    setMessage("");
    try {
      const response = await fetch("/api/schedule/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Scheduled order could not be cancelled.");
      setOrders(await load());
      setMessage("Scheduled delivery cancelled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scheduled order could not be cancelled.");
    }
  }

  return (
    <section className="scheduled-orders-manager">
      <h3>Scheduled deliveries</h3>
      {message && <p role="status">{message}</p>}
      {orders.filter((order) => order.status === "scheduled").length === 0
        ? <p>No upcoming deliveries are scheduled.</p>
        : orders.filter((order) => order.status === "scheduled").map((order) => (
          <div className="scheduled-order-row" key={order.id}>
            <span>{new Date(order.slot_time).toLocaleString()} {order.order_number ? `· ${order.order_number}` : ""}</span>
            <button type="button" className="checkout-raast-select" onClick={() => void cancel(order.id)}>Cancel</button>
          </div>
        ))}
    </section>
  );
}
