import "server-only";

export type AdminDashboard = {
  metrics: {
    total_orders: number;
    todays_orders: number;
    pending_orders: number;
    todays_revenue: number;
    total_customers: number;
    month_revenue: number;
    cancelled_today: number;
  };
  recent_orders: Array<{
    id: number;
    number: string;
    customer: string;
    amount: number;
    status: string;
  }>;
};

export type AdminCredentials = {
  username: string;
  applicationPassword: string;
};

export function isAdminBackendUnconfigured() {
  return !process.env.NEXT_PUBLIC_WORDPRESS_API_URL?.trim() &&
    !process.env.HMF_ADMIN_WP_USERNAME?.trim() &&
    !process.env.HMF_ADMIN_WP_APPLICATION_PASSWORD?.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getAdminApiUrl() {
  const apiUrl = process.env.NEXT_PUBLIC_WORDPRESS_API_URL?.replace(/\/+$/, "");
  if (!apiUrl) return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(apiUrl);
  } catch {
    return null;
  }
  const isLocalDevelopment = process.env.NODE_ENV !== "production" &&
    (parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1");
  if (parsedUrl.protocol !== "https:" && !isLocalDevelopment) return null;

  return apiUrl;
}

export function getAdminCredentials(): AdminCredentials | null {
  const username = process.env.HMF_ADMIN_WP_USERNAME?.trim();
  const applicationPassword = process.env.HMF_ADMIN_WP_APPLICATION_PASSWORD?.replace(/\s+/g, "");
  if (!username || !applicationPassword || username.includes(":")) return null;
  return { username, applicationPassword };
}

export function isAdminDashboard(value: unknown): value is AdminDashboard {
  if (!isRecord(value) || !("metrics" in value) || !("recent_orders" in value)) return false;
  const metrics = value.metrics;
  if (!isRecord(metrics)) return false;
  const metricKeys = ["total_orders", "todays_orders", "pending_orders", "todays_revenue", "total_customers", "month_revenue", "cancelled_today"] as const;
  if (!metricKeys.every((key) => key in metrics && typeof metrics[key] === "number" && Number.isFinite(metrics[key]))) return false;
  if (!Array.isArray(value.recent_orders)) return false;
  return value.recent_orders.every((order) =>
    typeof order === "object" && order !== null &&
    "id" in order && typeof order.id === "number" &&
    "number" in order && typeof order.number === "string" &&
    "customer" in order && typeof order.customer === "string" &&
    "amount" in order && typeof order.amount === "number" &&
    "status" in order && typeof order.status === "string",
  );
}
