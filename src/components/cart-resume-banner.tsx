"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { useSiteSettings } from "@/components/site-settings";

export function CartResumeBanner() {
  const { items } = useCart();
  const { t, formatCurrency } = useSiteSettings();
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
    <aside className="cart-resume-banner" aria-label={t("savedCart")}>
      <p><strong>{t("cartWaiting")}</strong><span>{count} {count === 1 ? t("item") : t("items")} · {formatCurrency(total)}</span></p>
      <Link href="/checkout">{t("resumeCheckout")} →</Link>
      <button type="button" aria-label={t("dismissCartReminder")} onClick={() => setDismissedPath(pathname)}>×</button>
    </aside>
  );
}
