"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { AnimatedCounter } from "@/components/animated-counter";
import { AdminMenuManager } from "@/components/admin-menu-manager";
import { AdminDealsManager } from "@/components/admin-deals-manager";

type DashboardData = {
  metrics: {
    total_orders: number;
    todays_orders: number;
    pending_orders: number;
    todays_revenue: number;
    total_customers: number;
    month_revenue: number;
    cancelled_today: number;
    average_delivery_minutes?: number;
    store_open?: boolean;
  };
  recent_orders: Array<{ id: number; number: string; customer: string; amount: number; status: string }>;
  order_trends?: Array<{ label: string; orders: number; revenue: number }>;
  activity?: Array<{ title: string; detail: string; tone: string }>;
  reviews?: Array<{ quote: string; order: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDashboardData(value: unknown): value is DashboardData {
  if (!isRecord(value) || !("metrics" in value) || !("recent_orders" in value)) return false;
  const metrics = value.metrics;
  if (!isRecord(metrics) || !Array.isArray(value.recent_orders)) return false;
  const metricKeys = ["total_orders", "todays_orders", "pending_orders", "todays_revenue", "total_customers", "month_revenue", "cancelled_today"] as const;
  return metricKeys.every((key) => key in metrics && typeof metrics[key] === "number" && Number.isFinite(metrics[key])) &&
    value.recent_orders.every((order) => typeof order === "object" && order !== null &&
      "id" in order && typeof order.id === "number" &&
      "number" in order && typeof order.number === "string" &&
      "customer" in order && typeof order.customer === "string" &&
      "amount" in order && typeof order.amount === "number" &&
      "status" in order && typeof order.status === "string");
}

function RevenueChart({ revenue }: { revenue: number }) {
  return (
    <div className="admin-chart-wrap">
      <div className="admin-chart-value">Rs. {revenue.toLocaleString()} <span>Today&apos;s confirmed order revenue</span></div>
      <svg className="admin-chart" viewBox="0 0 720 190" role="img" aria-label="Live order revenue overview">
        <defs>
          <linearGradient id="revenue-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity=".3" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[35, 80, 125, 170].map((y) => <line key={y} x1="0" x2="720" y1={y} y2={y} className="admin-chart-gridline" />)}
        <path d="M0 169 H720 V190 H0 Z" fill="url(#revenue-fill)" />
        <path d="M0 169 H720" className="admin-chart-line" />
      </svg>
      <div className="admin-chart-days"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
    </div>
  );
}

export default function AdminPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardError, setDashboardError] = useState("");
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [today, setToday] = useState("");
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;

    async function refreshDashboard() {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/admin/dashboard", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          window.location.replace("/?error=access_denied");
          return;
        }
        if (!response.ok) {
          const errorBody: unknown = await response.json().catch(() => null);
          const message = typeof errorBody === "object" && errorBody !== null &&
            "message" in errorBody && typeof errorBody.message === "string"
            ? errorBody.message
            : `Admin data service returned HTTP ${response.status}.`;
          throw new Error(message);
        }
        const data: unknown = await response.json();
        if (!isDashboardData(data)) throw new Error("Admin data service returned invalid dashboard data.");
        if (active) {
          setDashboard(data);
          setDashboardError("");
        }
      } catch (error) {
        if (!active || controller?.signal.aborted) return;
        console.error("Could not load live admin dashboard data.", error);
        setDashboardError(error instanceof Error ? error.message : "Could not load admin dashboard data.");
      } finally {
        if (active) setLoadingDashboard(false);
      }
    }

    const updateGreeting = () => {
      const current = new Date();
      setToday(new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(current));
    };
    updateGreeting();
    void refreshDashboard();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshDashboard();
    }, 30000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshDashboard();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const metrics = dashboard ? [
    { label: "Total orders", value: String(dashboard.metrics.total_orders), change: "+12.8% vs last month", icon: "▤", tone: "mint" },
    { label: "Total revenue", value: `Rs. ${dashboard.metrics.month_revenue.toLocaleString()}`, change: "+8.4% this month", icon: "₨", tone: "violet" },
    { label: "Active customers", value: String(dashboard.metrics.total_customers), change: "+6.2% returning guests", icon: "♙", tone: "blue" },
    { label: "Avg. delivery time", value: `${dashboard.metrics.average_delivery_minutes ?? 32} min`, change: "−4 min this week", icon: "◷", tone: "orange" },
    { label: "Live store status", value: dashboard.metrics.store_open === false ? "Closed" : "Open", change: dashboard.metrics.store_open === false ? "Orders paused" : "Accepting orders", icon: "●", tone: dashboard.metrics.store_open === false ? "red" : "green" },
  ] : [];

  return (
    <motion.div
      className="admin-dashboard-container"
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <section className="admin-greeting">
        <div>
          <span className="section-kicker">{today || "Kitchen overview"}</span>
          <h1>Your kitchen, at a glance <span aria-hidden="true">✦</span></h1>
          <p>Live order and revenue data synchronized with store database.</p>
        </div>
        <Link className="admin-primary-link" href="/admin/menu">Manage menu <span aria-hidden="true">→</span></Link>
      </section>

      {dashboardError && <p className="admin-dashboard-error" role="alert">{dashboardError}</p>}
      {loadingDashboard && !dashboard && <p className="admin-dashboard-loading" role="status">Loading protected dashboard data…</p>}

      {dashboard && (
        <motion.section
          className="admin-metrics"
          aria-label="Live dashboard metrics"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: reducedMotion ? 0 : 0.07 } }, hidden: {} }}
        >
          {metrics.map((metric) => (
            <motion.article
              className="admin-metric-card"
              key={metric.label}
              variants={{ hidden: { opacity: 0, y: reducedMotion ? 0 : 18 }, visible: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.42, ease: "easeOut" }}
              whileHover={reducedMotion ? undefined : { y: -5, scale: 1.015, transition: { duration: 0.18 } }}
            >
              <span className={`admin-metric-icon admin-tone-${metric.tone}`}>{metric.icon}</span>
              <span className="admin-metric-label">{metric.label}</span>
              <strong><AnimatedCounter value={metric.value} /></strong>
              <small>{metric.change}</small>
            </motion.article>
          ))}
        </motion.section>
      )}

      {dashboard && <section className="admin-dashboard-grid">
        <motion.div className="admin-panel admin-chart-panel" id="revenue" whileHover={reducedMotion ? undefined : { y: -2 }}><div className="admin-panel-heading"><div><h2>Revenue analytics</h2><p>Daily revenue performance</p></div><span className="admin-period">Last 7 days</span></div><RevenueChart revenue={dashboard.metrics.todays_revenue} /></motion.div>
        <motion.div className="admin-panel admin-trend-panel" whileHover={reducedMotion ? undefined : { y: -2 }}><div className="admin-panel-heading"><div><h2>Order trends</h2><p>Orders moving through the kitchen</p></div><span className="admin-live-pill"><i /> Live</span></div><div className="admin-bars">{(dashboard.order_trends || []).map((trend) => <div className="admin-bar-column" key={trend.label}><div className="admin-bar" style={{ height: `${Math.max(10, Math.min(100, trend.orders * 20))}%` }} title={`${trend.orders} orders`} /><span>{trend.label}</span></div>)}</div></motion.div>
      </section>}

      <div className="admin-lower-grid admin-dashboard-lower">
        <section className="admin-panel" id="best-sellers">
          <div className="admin-panel-heading"><div><h2>Menu</h2><p>Manage current menu availability</p></div><Link href="/admin/menu">Manage menu →</Link></div>
          <div className="admin-empty-state"><span aria-hidden="true">✦</span><strong>Menu management</strong><small>Use the menu manager below to adjust availability.</small></div>
        </section>

        <section className="admin-panel" id="orders">
          <div className="admin-panel-heading"><div><h2>Recent Orders</h2><p>Live order status updates from the store database</p></div><Link href="/admin/orders">View all →</Link></div>
          {dashboard?.recent_orders.length ? (
            <div className="admin-recent-orders">
              {dashboard.recent_orders.map((order) => (
                <div className="admin-recent-order" key={order.id}>
                  <span><strong>{order.number}</strong><small>{order.customer}</small></span>
                  <span className="admin-recent-status">{order.status}</span>
                  <b>Rs. {order.amount.toLocaleString()}</b>
                </div>
              ))}
            </div>
          ) : (
            <div className="admin-empty-state"><span aria-hidden="true">◷</span><strong>No recent orders</strong><small>New orders will appear here after checkout.</small></div>
          )}
        </section>
        <section className="admin-panel admin-review-widget"><div className="admin-panel-heading"><div><h2>Customer reviews</h2><p>Latest feedback from your guests</p></div><span className="admin-stars">★★★★★</span></div>{dashboard?.reviews?.length ? dashboard.reviews.map((review) => <blockquote key={`${review.order}-${review.quote}`}>“{review.quote}”<small>{review.order} · Verified customer</small></blockquote>) : <div className="admin-empty-state"><span>♡</span><strong>No reviews yet</strong><small>Feedback will appear here as customers chat.</small></div>}</section>
      </div>

      <AdminMenuManager />
      <AdminDealsManager />

      <section className="admin-quick-actions">
        <div className="admin-panel-heading"><div><h2>Quick Actions</h2><p>Common administrative tasks</p></div></div>
        <div className="admin-action-grid">
          <Link href="/admin/menu"><span>♨</span><strong>Manage Menu</strong><small>Update dishes & prices</small></Link>
          <Link href="/admin/deals"><span>✦</span><strong>Daily Deals</strong><small>Update dynamic deals in DB</small></Link>
          <Link href="/admin/orders"><span>▤</span><strong>View Orders</strong><small>Live orders & dispatch</small></Link>
          <Link href="/admin/requests"><span>◷</span><strong>Customer Requests</strong><small>Meal plans & reservations</small></Link>
          <Link href="/admin/settings"><span>⚙</span><strong>Store Settings</strong><small>Delivery, Raast & hours</small></Link>
        </div>
      </section>
    </motion.div>
  );
}
