import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, getSupabaseOrders } from "@/lib/supabase-server";
import { CUSTOMER_SESSION_COOKIE, verifySignedCustomerSession } from "@/lib/customer-session";
import { supabaseErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = verifySignedCustomerSession(request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value);
  if (!session?.verified || session.exp <= Math.floor(Date.now() / 1000) || (!session.email && !session.phone)) {
    return NextResponse.json({ error: "Sign in with a verified account to reorder." }, { status: 401 });
  }
  try {
    const body = await request.json() as { number?: unknown };
    const number = typeof body.number === "string" ? body.number.trim() : "";
    if (!/^[#A-Z0-9-]{4,40}$/iu.test(number)) {
      return NextResponse.json({ error: "A valid order number is required." }, { status: 400 });
    }
    assertSupabaseConfigured();
    const orders = await getSupabaseOrders();
    const original = orders.find((order) => order.number.toLowerCase() === number.toLowerCase());
    const ownsOrder = Boolean(original && (
      (session.email && original.customerEmail?.toLowerCase() === session.email.toLowerCase()) ||
      (session.phone && original.customerPhone.replace(/\D/g, "").endsWith(session.phone.replace(/\D/g, "").slice(-10)))
    ));
    if (!original || !ownsOrder) return NextResponse.json({ error: "Order not found for this customer." }, { status: 404 });
    if (original.status === "cancelled" || !original.items.length) {
      return NextResponse.json({ error: "This order cannot be reordered." }, { status: 409 });
    }
    return NextResponse.json({
      items: original.items.map((item) => ({
        ...item,
        quantity: Math.min(20, Math.max(1, Math.floor(item.quantity))),
      })),
      area: original.area,
      address: original.address,
      sourceOrder: original.number,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[REORDER_CUSTOMER_ORDER_ERROR]", error);
    return supabaseErrorResponse(error, "This order could not be reordered.");
  }
}
