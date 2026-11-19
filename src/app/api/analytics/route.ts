import { NextRequest, NextResponse } from "next/server";
import { cookieName, DEFAULT_ADMIN_SECRET, readAdminSession } from "@/lib/admin-session";
import {
  assertSupabaseConfigured,
  getSupabaseCustomers,
  getSupabaseDishes,
  getSupabaseOrders,
} from "@/lib/supabase-server";
import { supabaseErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dateKeyInPakistan(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function GET(request: NextRequest) {
  const session = await readAdminSession(
    request.cookies.get(cookieName)?.value,
    process.env.HMF_ADMIN_SESSION_SECRET || DEFAULT_ADMIN_SECRET,
  );
  if (!session) {
    return NextResponse.json({ message: "Admin sign-in is required." }, { status: 401 });
  }

  try {
    assertSupabaseConfigured();
    const [orders, customers, dishes] = await Promise.all([
      getSupabaseOrders(),
      getSupabaseCustomers(),
      getSupabaseDishes(),
    ]);
    const today = dateKeyInPakistan(new Date());
    const todayOrders = orders.filter((order) => {
      const createdAt = new Date(order.createdAt);
      return !Number.isNaN(createdAt.getTime()) && dateKeyInPakistan(createdAt) === today;
    });
    const completedSales = orders.filter((order) => order.status !== "cancelled");
    const todaySales = todayOrders.filter((order) => order.status !== "cancelled");
    const dishSales = new Map<string, { name: string; count: number; revenue: number }>();

    for (const order of completedSales) {
      for (const item of order.items || []) {
        const name = item.name || `Dish #${item.id}`;
        const sale = dishSales.get(name) || { name, count: 0, revenue: 0 };
        const quantity = item.quantity || 1;
        sale.count += quantity;
        sale.revenue += (item.price || 0) * quantity;
        dishSales.set(name, sale);
      }
    }

    const analytics = {
      totalRevenue: completedSales.reduce((sum, order) => sum + order.total, 0),
      totalOrders: orders.length,
      deliveredOrders: orders.filter((order) => order.status === "delivered" || order.status === "completed").length,
      pendingOrders: orders.filter((order) => order.status === "pending" || order.status === "new" || order.status === "confirmed" || order.status === "preparing").length,
      cancelledOrders: orders.filter((order) => order.status === "cancelled").length,
      todaysRevenue: todaySales.reduce((sum, order) => sum + order.total, 0),
      todaysOrdersCount: todayOrders.length,
      totalCustomers: customers.length,
      activeDishesCount: dishes.filter((dish) => dish.available !== false).length,
      topDishes: [...dishSales.values()].sort((a, b) => b.count - a.count).slice(0, 5),
    };

    return NextResponse.json(
      { success: true, analytics },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Failed to load analytics:", error);
    return supabaseErrorResponse(error, "Failed to load store analytics");
  }
}
