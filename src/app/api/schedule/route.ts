import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, getSupabaseProfileIdForCustomer, getSupabaseScheduledOrders } from "@/lib/supabase-server";
import { CUSTOMER_SESSION_COOKIE, verifySignedCustomerSession } from "@/lib/customer-session";
import { supabaseErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function GET(request: NextRequest) {
  const session = verifySignedCustomerSession(request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value);
  if (!session?.verified || session.exp <= Math.floor(Date.now() / 1000) || !uuidPattern.test(session.customerId)) {
    return NextResponse.json({ error: "Sign in with a verified account to load scheduled orders." }, { status: 401 });
  }
  try {
    assertSupabaseConfigured();
    const profileId = await getSupabaseProfileIdForCustomer(session.customerId);
    if (!profileId) return NextResponse.json({ error: "Customer profile was not found." }, { status: 404 });
    return NextResponse.json({ scheduledOrders: await getSupabaseScheduledOrders(profileId) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[GET_SCHEDULED_ORDERS_ERROR]", error);
    return supabaseErrorResponse(error, "Scheduled orders could not be loaded.");
  }
}
