import { NextRequest, NextResponse } from "next/server";
import { CUSTOMER_SESSION_COOKIE, verifySignedCustomerSession } from "@/lib/customer-session";
import { assertSupabaseConfigured, getSupabaseOrders } from "@/lib/supabase-server";
import { supabaseErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    assertSupabaseConfigured();
    const session = verifySignedCustomerSession(request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value);
    if (!session || session.exp <= Math.floor(Date.now() / 1000) || !session.verified || (!session.email && !session.phone)) {
      return NextResponse.json({ error: "A verified customer session is required." }, { status: 401 });
    }
    const orders = (await getSupabaseOrders()).filter((order) =>
      session.email
        ? order.customerEmail?.toLowerCase() === session.email.toLowerCase()
        : order.customerPhone.replace(/\D/g, "").endsWith(session.phone!.replace(/\D/g, "").slice(-10))
    );
    return NextResponse.json({ ok: true, orders }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("[GET_CUSTOMER_ORDERS_ERROR]", error);
    return supabaseErrorResponse(error, "Failed to load customer orders");
  }
}
