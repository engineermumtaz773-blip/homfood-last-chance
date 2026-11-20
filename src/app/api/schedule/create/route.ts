import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, createSupabaseScheduledOrder, getSupabaseOrder, getSupabaseCustomerSubscriptions, getSupabaseProfileIdForCustomer } from "@/lib/supabase-server";
import { CUSTOMER_SESSION_COOKIE, verifySignedCustomerSession } from "@/lib/customer-session";
import { supabaseErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function POST(request: NextRequest) {
  const session = verifySignedCustomerSession(request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value);
  if (!session?.verified || session.exp <= Math.floor(Date.now() / 1000) || !uuidPattern.test(session.customerId)) {
    return NextResponse.json({ error: "Sign in with a verified account to schedule an order." }, { status: 401 });
  }
  try {
    const body = await request.json() as { slotTime?: unknown; planId?: unknown; orderNumber?: unknown };
    if (typeof body.slotTime !== "string" || typeof body.orderNumber !== "string" ||
      !body.orderNumber.trim() || (body.planId !== undefined && body.planId !== null && (typeof body.planId !== "string" || !uuidPattern.test(body.planId)))) {
      return NextResponse.json({ error: "A valid time slot and order number are required." }, { status: 400 });
    }
    const slot = new Date(body.slotTime);
    if (Number.isNaN(slot.getTime()) || slot.getTime() < Date.now() + 15 * 60_000 || slot.getTime() > Date.now() + 30 * 24 * 60 * 60_000) {
      return NextResponse.json({ error: "Choose a delivery slot at least 15 minutes from now and within 30 days." }, { status: 400 });
    }
    assertSupabaseConfigured();
    const profileId = await getSupabaseProfileIdForCustomer(session.customerId);
    if (!profileId) return NextResponse.json({ error: "Customer profile was not found." }, { status: 404 });
    const order = await getSupabaseOrder(body.orderNumber);
    const ownsOrder = Boolean(order && (
      (session.email && order.customerEmail?.toLowerCase() === session.email.toLowerCase()) ||
      (session.phone && order.customerPhone.replace(/\D/g, "").endsWith(session.phone.replace(/\D/g, "").slice(-10)))
    ));
    if (!order || !ownsOrder) return NextResponse.json({ error: "Order not found for this customer." }, { status: 404 });
    if (typeof body.planId === "string") {
      const plans = await getSupabaseCustomerSubscriptions(session.customerId);
      if (!plans.some((plan) => plan.id === body.planId)) return NextResponse.json({ error: "The selected meal plan was not found." }, { status: 404 });
    }
    const scheduledOrder = await createSupabaseScheduledOrder({
      userId: profileId,
      slotTime: slot.toISOString(),
      planId: typeof body.planId === "string" ? body.planId : undefined,
      orderNumber: order.number,
    });
    return NextResponse.json({ scheduledOrder }, { status: 201 });
  } catch (error) {
    console.error("[CREATE_SCHEDULED_ORDER_ERROR]", error);
    return supabaseErrorResponse(error, "The delivery slot could not be scheduled.");
  }
}
