import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, cancelSupabaseScheduledOrder, getSupabaseProfileIdForCustomer } from "@/lib/supabase-server";
import { CUSTOMER_SESSION_COOKIE, verifySignedCustomerSession } from "@/lib/customer-session";
import { supabaseErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function POST(request: NextRequest) {
  const session = verifySignedCustomerSession(request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value);
  if (!session?.verified || session.exp <= Math.floor(Date.now() / 1000) || !uuidPattern.test(session.customerId)) {
    return NextResponse.json({ error: "Sign in with a verified account to cancel a scheduled order." }, { status: 401 });
  }
  try {
    const body = await request.json() as { id?: unknown };
    if (typeof body.id !== "string" || !uuidPattern.test(body.id)) {
      return NextResponse.json({ error: "A valid scheduled order ID is required." }, { status: 400 });
    }
    assertSupabaseConfigured();
    const profileId = await getSupabaseProfileIdForCustomer(session.customerId);
    if (!profileId) return NextResponse.json({ error: "Customer profile was not found." }, { status: 404 });
    const scheduledOrder = await cancelSupabaseScheduledOrder(profileId, body.id);
    if (!scheduledOrder) return NextResponse.json({ error: "Scheduled order not found or already cancelled." }, { status: 404 });
    return NextResponse.json({ scheduledOrder });
  } catch (error) {
    console.error("[CANCEL_SCHEDULED_ORDER_ERROR]", error);
    return supabaseErrorResponse(error, "The scheduled order could not be cancelled.");
  }
}
