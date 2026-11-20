"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { trackFunnelEvent } from "@/lib/funnel";

export type CartLine = { id: number; name: string; portion: string; price: number; quantity: number; specialInstructions?: string };
type CartContextValue = {
  items: CartLine[];
  addItem: (line: Omit<CartLine, "quantity"> & { quantity?: number }) => void;
  updateQuantity: (id: number, portion: string, quantity: number, specialInstructions?: string) => void;
  removeItem: (id: number, portion: string, specialInstructions?: string) => void;
  clearCart: () => void;
};
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
    try {
      const saved = localStorage.getItem("hmf_cart");
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const validItems = parsed.filter((item): item is CartLine => {
            if (typeof item !== "object" || item === null) return false;
            const line = item as Record<string, unknown>;
            return typeof line.id === "number" &&
              typeof line.name === "string" &&
              typeof line.portion === "string" &&
              typeof line.price === "number" &&
              typeof line.quantity === "number";
          });
          setItems(validItems);
        }
      }
    } catch (error) {
      console.error("Could not restore the saved shopping cart.", error);
    }
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("hmf_cart", JSON.stringify(items));
  }, [items, hydrated]);
  const addItem = useCallback((line: Omit<CartLine, "quantity"> & { quantity?: number }) => {
    trackFunnelEvent("add_to_cart", { product_id: line.id, quantity: Math.max(1, Math.floor(line.quantity ?? 1)) });
    setItems((current) => {
      const quantity = Math.max(1, Math.floor(line.quantity ?? 1));
      const existing = current.find((item) =>
        item.id === line.id &&
        item.portion === line.portion &&
        item.specialInstructions === line.specialInstructions,
      );
      if (existing) return current.map((item) => item === existing ? { ...item, quantity: item.quantity + quantity } : item);
      return [...current, { ...line, quantity }];
    });
  }, []);
  const updateQuantity = useCallback((id: number, portion: string, quantity: number, specialInstructions?: string) => {
    setItems((current) => current.flatMap((item) => {
      if (item.id !== id || item.portion !== portion || item.specialInstructions !== specialInstructions) return [item];
      return quantity > 0 ? [{ ...item, quantity: Math.floor(quantity) }] : [];
    }));
  }, []);
  const removeItem = useCallback((id: number, portion: string, specialInstructions?: string) => {
    setItems((current) => current.filter((item) =>
      item.id !== id ||
      item.portion !== portion ||
      item.specialInstructions !== specialInstructions,
    ));
  }, []);
  const clearCart = useCallback(() => setItems([]), []);
  const value = useMemo(() => ({ items, addItem, updateQuantity, removeItem, clearCart }), [items, addItem, updateQuantity, removeItem, clearCart]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside CartProvider.");
  return value;
}
