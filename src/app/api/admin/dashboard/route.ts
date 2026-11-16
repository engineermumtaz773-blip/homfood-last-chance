import { NextRequest, NextResponse } from "next/server";
import { cookieName, readAdminSession, DEFAULT_ADMIN_SECRET } from "@/lib/admin-session";
import { assertSupabaseConfigured, getSupabaseCustomers, getSupabaseOrders, getSupabaseSettings } from "@/lib/supabase-server";
import { supabaseErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sessionSecret = process.env.HMF_ADMIN_SESSION_SECRET || DEFAULT_ADMIN_SECRET;
  const session = await readAdminSession(request.cookies.get(cookieName)?.value, sessionSecret);
  if (!session) {
    return NextResponse.json({ message: "Admin sign-in is required." }, { status: 401 });
  }

  try {
  assertSupabaseConfigured();
  const [orders, customers, settings] = await Promise.all([getSupabaseOrders(), getSupabaseCustomers(), getSupabaseSettings()]);
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const todaysOrders = orders.filter((o) => o.createdAt?.startsWith(todayStr));
  const todaysRevenue = todaysOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const monthStr = now.toISOString().slice(0, 7);
  const monthRevenue = orders
    .filter((o) => o.createdAt?.startsWith(monthStr))
    .reduce((sum, o) => sum + (o.total || 0), 0);

  const pendingOrders = orders.filter((o) => o.status === "pending" || o.status === "preparing").length;
  const cancelledToday = todaysOrders.filter((o) => o.status === "cancelled").length;

  const recentOrders = orders.slice(0, 10).map((o, idx) => ({
    id: idx + 1,
    number: o.number || `#HMF-${idx + 100}`,
    customer: o.customerName || "Customer",
    amount: o.total || 0,
    status: o.status || "pending",
  }));

  const localDashboard = {
    metrics: {
      total_orders: orders.length,
      todays_orders: todaysOrders.length,
      pending_orders: pendingOrders,
      todays_revenue: todaysRevenue,
      total_customers: customers.length,
      month_revenue: monthRevenue || todaysRevenue,
      cancelled_today: cancelledToday,
      average_delivery_minutes: 32,
      store_open: settings?.restaurant?.isOpen !== false,
    },
    recent_orders: recentOrders,
    order_trends: Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now);
      date.setDate(now.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      return {
        label: date.toLocaleDateString("en-US", { weekday: "short" }),
        orders: orders.filter((order) => order.createdAt.startsWith(key)).length,
        revenue: orders.filter((order) => order.createdAt.startsWith(key) && order.status !== "cancelled").reduce((sum, order) => sum + order.total, 0),
      };
    }),
    activity: recentOrders.slice(0, 5).map((order) => ({
      title: `${order.number} · ${order.customer}`,
      detail: `${order.status} · Rs. ${order.amount.toLocaleString()}`,
      tone: order.status === "cancelled" ? "danger" : order.status === "delivered" ? "success" : "active",
    })),
    reviews: [],
  };

  return NextResponse.json(localDashboard, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[ADMIN_DASHBOARD_ERROR]", error);
    return supabaseErrorResponse(error, "Failed to load admin dashboard");
  }
}
