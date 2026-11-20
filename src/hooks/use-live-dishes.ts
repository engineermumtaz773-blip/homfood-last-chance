"use client";

import { useEffect, useState, useCallback } from "react";
import type { Dish } from "@/lib/data";
import { REALTIME_SYNC_EVENT } from "@/lib/realtime-client";
import { REALTIME_EVENT_DOM, type RealtimeEventPayload } from "@/lib/realtime-bus";

export function useLiveDishes(initialDishes: Dish[]) {
  const [dishes, setDishes] = useState<Dish[]>(Array.isArray(initialDishes) ? initialDishes : []);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(!Array.isArray(initialDishes) || initialDishes.length === 0);

  const refreshCatalog = useCallback(async () => {
    try {
      const response = await fetch("/api/menu", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Menu API returned ${response.status}`);
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || !Array.isArray((data as { dishes?: unknown }).dishes)) {
        throw new Error("Menu API returned an invalid Supabase response.");
      }
      const nextDishes = (data as { dishes: Dish[] }).dishes;
      setConnected(true);
      setLoading(false);
      setDishes((current) =>
        JSON.stringify(current) === JSON.stringify(nextDishes) ? current : nextDishes
      );
    } catch (err) {
      console.error("Could not fetch live menu from Supabase:", err);
      setConnected(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void refreshCatalog(); });

    // High-frequency polling for instant sync between admin and customer
    const interval = window.setInterval(refreshCatalog, 3500);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshCatalog();
    };
    const onStockChange = () => {
      void refreshCatalog();
    };

    const onRealtimeBusEvent = (e: Event) => {
      const ce = e as CustomEvent<RealtimeEventPayload>;
      if (
        ce.detail &&
        (ce.detail.type === "menu_updated" ||
          ce.detail.type === "deal_updated" ||
          ce.detail.type === "settings_updated")
      ) {
        void refreshCatalog();
      }
    };

    window.addEventListener("focus", onVisibilityChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("hmf-stock-change", onStockChange);
    window.addEventListener(REALTIME_SYNC_EVENT, onStockChange);
    window.addEventListener(REALTIME_EVENT_DOM, onRealtimeBusEvent);

    // Cross-tab zero-latency broadcast sync
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("hmf_menu_channel");
      channel.onmessage = () => {
        void refreshCatalog();
      };
    } catch {
      /* BroadcastChannel is optional */
    }

    return () => {
      window.clearInterval(interval);
      window.cancelAnimationFrame(frame);
      window.removeEventListener("focus", onVisibilityChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("hmf-stock-change", onStockChange);
      window.removeEventListener(REALTIME_SYNC_EVENT, onStockChange);
      window.removeEventListener(REALTIME_EVENT_DOM, onRealtimeBusEvent);
      if (channel) channel.close();
    };
  }, [refreshCatalog]);

  const setAvailability = useCallback(
    async (id: number, available: boolean) => {
      // Optimistic update
      setDishes((current) =>
        current.map((dish) => (dish.id === id ? { ...dish, available, soldOut: !available } : dish))
      );
      window.dispatchEvent(new Event("hmf-stock-change"));

      try {
        const channel = new BroadcastChannel("hmf_menu_channel");
        channel.postMessage("stock-changed");
        channel.close();
      } catch {
        /* BroadcastChannel is optional */
      }

      try {
        const res = await fetch("/api/menu", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, available }),
        });
        if (!res.ok) {
          throw new Error(`Failed to persist availability to database: ${res.status}`);
        }
      } catch (err) {
        console.error("Failed to update dish availability in database:", err);
        // Rollback on failure
        void refreshCatalog();
      }
    },
    [refreshCatalog]
  );

  return { dishes, connected, loading, setAvailability, refresh: refreshCatalog };
}
