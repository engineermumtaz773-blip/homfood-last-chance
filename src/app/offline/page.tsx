import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline | Home Made Food",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="offline-page">
      <span className="section-kicker">Home Made Food</span>
      <h1>You&apos;re offline</h1>
      <p>Reconnect to the internet to browse the latest menu and place an order. Your cart remains saved on this device.</p>
      <Link className="hero-cta" href="/">Try again <span aria-hidden="true">→</span></Link>
    </main>
  );
}
