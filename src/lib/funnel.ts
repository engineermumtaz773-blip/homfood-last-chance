export type FunnelEvent =
  | "menu_loaded"
  | "add_to_cart"
  | "checkout_started"
  | "order_placed"
  | "receipt_uploaded"
  | "order_tracked";

export function trackFunnelEvent(event: FunnelEvent, metadata: Record<string, string | number | boolean> = {}) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({ event, metadata });
  if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/funnel", new Blob([body], { type: "application/json" }))) return;
  void fetch("/api/funnel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch((error: unknown) => console.error("Could not record the storefront funnel event.", error));
}
