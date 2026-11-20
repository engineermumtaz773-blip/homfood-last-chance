import { Suspense } from "react";
import { OrderConfirmation } from "@/components/order-confirmation";

export default function OrderConfirmationPage() {
  return <Suspense fallback={<section className="order-confirmation-page"><p>Loading your order…</p></section>}><OrderConfirmation /></Suspense>;
}
