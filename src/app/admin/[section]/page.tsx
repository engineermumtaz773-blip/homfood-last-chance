import { notFound } from "next/navigation";
import { AdminMenuManager } from "@/components/admin-menu-manager";
import { AdminDealsManager } from "@/components/admin-deals-manager";
import { AdminCustomersManager } from "@/components/admin-customers-manager";
import { AdminOrdersManager } from "@/components/admin-orders-manager";
import { AdminCategoriesManager } from "@/components/admin-categories-manager";
import { AdminAnalyticsManager } from "@/components/admin-analytics-manager";
import { AdminSettingsManager } from "@/components/admin-settings-manager";
import { AdminRequestsManager } from "@/components/admin-requests-manager";

const sections = [
  { slug: "orders", title: "Orders", description: "Manage customer orders, update delivery status, and assign dispatch riders." },
  { slug: "requests", title: "Meal Plans & Reservations", description: "Review customer meal-plan and table-reservation requests." },
  { slug: "menu", title: "Menu", description: "Add, edit, and organize the dishes shown on your public menu." },
  { slug: "deals", title: "Daily Deals", description: "Manage dynamic daily deals and special bundle pricing in the store database." },
  { slug: "categories", title: "Categories", description: "Create, rename, and manage dish categories in real-time." },
  { slug: "customers", title: "Customers", description: "Manage synchronized customer records from Google Sign-In and Email OTP verifications." },
  { slug: "analytics", title: "Analytics", description: "Live sales, order velocity, and revenue reports synchronized with store database." },
  { slug: "settings", title: "Settings", description: "Configure restaurant identity, delivery thresholds, MCB Raast QR, schedule, and admin security across 6 tabs." },
] as const;

export function generateStaticParams() {
  return sections.map(({ slug }) => ({ section: slug }));
}

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const currentSection = sections.find(({ slug }) => slug === section);

  if (!currentSection) notFound();

  return (
    <div className="admin-section-content">
      {currentSection.slug === "orders" && <AdminOrdersManager />}
      {currentSection.slug === "requests" && <AdminRequestsManager />}
      {currentSection.slug === "menu" && <AdminMenuManager />}
      {currentSection.slug === "deals" && <AdminDealsManager />}
      {currentSection.slug === "categories" && <AdminCategoriesManager />}
      {currentSection.slug === "customers" && <AdminCustomersManager />}
      {currentSection.slug === "analytics" && <AdminAnalyticsManager />}
      {currentSection.slug === "settings" && <AdminSettingsManager />}
    </div>
  );
}
