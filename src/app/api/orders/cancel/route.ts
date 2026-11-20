import { NextRequest, NextResponse } from "next/server";
import { cancelSupabaseOrder, assertSupabaseConfigured, getSupabaseOrder } from "@/lib/supabase-server";
import { supabaseErrorResponse } from "@/lib/api-errors";
import { CUSTOMER_SESSION_COOKIE, verifySignedCustomerSession } from "@/lib/customer-session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: { number?: unknown; phone?: unknown; reason?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const number = typeof body.number === "string" ? body.number.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!number || (phone && phone.replace(/\D/g, "").length < 10)) {
    return NextResponse.json({ ok: false, error: "Order number and valid customer phone are required." }, { status: 400 });
  }
  if (reason.length > 500) {
    return NextResponse.json({ ok: false, error: "Cancellation reason must be 500 characters or fewer." }, { status: 400 });
  }

  try {
    assertSupabaseConfigured();
    let verifiedPhone = phone;
    if (!verifiedPhone) {
      const session = verifySignedCustomerSession(request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value);
      if (!session || session.exp <= Math.floor(Date.now() / 1000) || !session.verified) {
        return NextResponse.json({ ok: false, error: "A valid phone number or verified customer session is required." }, { status: 401 });
      }
      const order = await getSupabaseOrder(number);
      const ownsByEmail = Boolean(session.email && order?.customerEmail?.toLowerCase() === session.email.toLowerCase());
      const sessionPhone = session.phone?.replace(/\D/g, "").slice(-10);
      const ownsByPhone = Boolean(sessionPhone && sessionPhone.length === 10 && order?.customerPhone.replace(/\D/g, "").endsWith(sessionPhone));
      if (!order || (!ownsByEmail && !ownsByPhone)) {
        return NextResponse.json({ ok: false, error: "Order not found for this customer." }, { status: 404 });
      }
      verifiedPhone = order.customerPhone;
    }
    const outcome = await cancelSupabaseOrder(number, verifiedPhone, reason);
    if (outcome.result === "not_found") {
      return NextResponse.json({ ok: false, error: "Order not found for that phone number." }, { status: 404 });
    }
    if (outcome.result === "expired") {
      return NextResponse.json({
        ok: false,
        error: "The 5-minute cancellation window has expired. Please contact the kitchen for help.",
        order: outcome.order,
      }, { status: 409 });
    }
    if (outcome.result === "locked") {
      return NextResponse.json({
        ok: false,
        error: `This order can no longer be cancelled because it is ${outcome.order?.status.replaceAll("_", " ")}.`,
        order: outcome.order,
      }, { status: 409 });
    }
    if (!outcome.order) throw new Error("Supabase cancelled the order without returning its updated record.");
    return NextResponse.json({ ok: true, message: "Order cancelled successfully.", order: outcome.order });
  } catch (error) {
    console.error("[CANCEL_ORDER_ERROR]", error);
    return supabaseErrorResponse(error, "Failed to cancel order.");
  }
}
