"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "@/components/cart-provider";

export function CartResumeBanner() {
  const { items } = useCart();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [dismissedPath, setDismissedPath] = useState<string | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!ready || dismissedPath === pathname || pathname === "/checkout" || items.length === 0) return null;
  const count = items.reduce((total, item) => total + item.quantity, 0);
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <aside className="cart-resume-banner" aria-label="Saved cart">
      <p><strong>Your cart is waiting</strong><span>{count} {count === 1 ? "item" : "items"} · PKR {total.toLocaleString("en-PK")}</span></p>
      <Link href="/checkout">Resume checkout →</Link>
      <button type="button" aria-label="Dismiss cart reminder" onClick={() => setDismissedPath(pathname)}>×</button>
    </aside>
  );
}
