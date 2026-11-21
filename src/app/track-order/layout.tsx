import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Track Your Order",
    description: "Check the latest status of a Home Made Food delivery in Bahawalpur.",
    path: "/track-order",
  }),
  robots: { index: false, follow: false },
};

export default function TrackOrderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
