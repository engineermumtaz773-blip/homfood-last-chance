import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Homemade Meal Plans",
  description: "Request a weekly or monthly homemade meal plan from Home Made Food in Bahawalpur.",
  path: "/subscriptions",
});

export default function SubscriptionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
