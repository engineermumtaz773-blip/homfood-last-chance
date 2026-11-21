import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Table Reservations",
  description: "Request a table reservation with Home Made Food in Bahawalpur.",
  path: "/reservations",
});

export default function ReservationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
