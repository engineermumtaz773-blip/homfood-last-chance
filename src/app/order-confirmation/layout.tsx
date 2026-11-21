import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Order Confirmation",
    description: "Review your Home Made Food order confirmation.",
    path: "/order-confirmation",
  }),
  robots: { index: false, follow: false },
};

export default function OrderConfirmationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
