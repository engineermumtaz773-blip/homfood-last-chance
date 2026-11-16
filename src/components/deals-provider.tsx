"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Deal } from "@/lib/store-db";

export type { Deal };

type DealsContextValue = {
  deals: Deal[];
  loading: boolean;
  addDeal: (deal: Omit<Deal, "id"> & { id?: number }) => Promise<Deal | null>;
  removeDeal: (id: number) => Promise<boolean>;
  refreshDeals: () => Promise<void>;
};

const DealsContext = createContext<DealsContextValue | null>(null);

export function DealsProvider({ children }: { children: React.ReactNode }) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDeals = useCallback(async () => {
    try {
      const res = await fetch("/api/deals", {
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`Deals request failed (${res.status}).`);
      if (res.ok) {
        const data: unknown = await res.json();
        if (Array.isArray(data)) {
          const freshDeals = data.filter((deal): deal is Deal => {
            if (!deal || typeof deal !== "object") return false;
            const candidate = deal as Partial<Deal>;
            return typeof candidate.id === "number" &&
              typeof candidate.title === "string" &&
              typeof candidate.regularPrice === "number" &&
              typeof candidate.discountedPrice === "number";
          });
          setDeals(freshDeals);
          return;
        }
      }
    } catch (err) {
      console.error("Could not load deals from the Supabase-backed deals endpoint.", err);
      setDeals([]);
    }
  }, []);

  useEffect(() => {
    void fetchDeals().finally(() => setLoading(false));
    const interval = window.setInterval(fetchDeals, 12000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void fetchDeals();
    };
    window.addEventListener("focus", onVisibility);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onVisibility);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchDeals]);

  const addDeal = useCallback(
    async (dealData: Omit<Deal, "id"> & { id?: number }): Promise<Deal | null> => {
      try {
        const res = await fetch("/api/deals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dealData),
        });
        if (!res.ok) throw new Error(`Add deal failed: HTTP ${res.status}`);
        const result = await res.json();
        if (result.success && result.deal) {
          const savedDeal = result.deal as Deal;
          setDeals((current) => {
            const exists = current.some((d) => d.id === savedDeal.id);
            if (exists) {
              return current.map((d) => (d.id === savedDeal.id ? savedDeal : d));
            }
            return [...current, savedDeal];
          });
          return savedDeal;
        }
      } catch (err) {
        console.error("Failed to persist deal to database:", err);
      }
      return null;
    },
    []
  );

  const removeDeal = useCallback(async (id: number): Promise<boolean> => {
    // Optimistic removal
    setDeals((current) => current.filter((deal) => deal.id !== id));
    try {
      const res = await fetch(`/api/deals?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: HTTP ${res.status}`);
      return true;
    } catch (err) {
      console.error("Failed to delete deal from database:", err);
      void fetchDeals();
      return false;
    }
  }, [fetchDeals]);

  const value = useMemo(
    () => ({
      deals,
      loading,
      addDeal,
      removeDeal,
      refreshDeals: fetchDeals,
    }),
    [deals, loading, addDeal, removeDeal, fetchDeals]
  );

  return <DealsContext.Provider value={value}>{children}</DealsContext.Provider>;
}

export function useDeals() {
  const value = useContext(DealsContext);
  if (!value) throw new Error("useDeals must be used inside DealsProvider.");
  return value;
}
