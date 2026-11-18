import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, createSupabaseReview, getPublicSupabaseReviews, getSupabaseOrder } from "@/lib/supabase-server";
import { CUSTOMER_SESSION_COOKIE, verifySignedCustomerSession } from "@/lib/customer-session";
import { supabaseErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    assertSupabaseConfigured();
    return NextResponse.json({ reviews: await getPublicSupabaseReviews() }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (error) {
    console.error("[GET_REVIEWS_ERROR]", error);
    return supabaseErrorResponse(error, "Reviews are temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { number?: unknown; phone?: unknown; menuItemId?: unknown; rating?: unknown; comment?: unknown };
    const number = typeof body.number === "string" ? body.number.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const menuItemId = Number(body.menuItemId);
    const rating = Number(body.rating);
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";
    if (!number || !phone || !Number.isSafeInteger(menuItemId) || menuItemId < 1 ||
      !Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length > 1000) {
      return NextResponse.json({ error: "Enter your order number, phone, dish, 1–5 star rating, and a comment under 1,000 characters." }, { status: 400 });
    }
    assertSupabaseConfigured();
    const order = await getSupabaseOrder(number, phone);
    if (!order) return NextResponse.json({ error: "We could not verify that order and phone number." }, { status: 404 });
    if (order.status !== "delivered") return NextResponse.json({ error: "Reviews can be submitted after delivery." }, { status: 409 });
    if (!order.items.some((item) => item.id === menuItemId)) return NextResponse.json({ error: "That dish is not part of this order." }, { status: 400 });
    const session = verifySignedCustomerSession(request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value);
    const customerId = session?.verified && session.exp > Math.floor(Date.now() / 1000) ? session.customerId : undefined;
    const review = await createSupabaseReview({ orderId: order.id, customerId, menuItemId, rating, comment });
    return NextResponse.json({ review, message: "Thanks! Your review will appear after moderation." }, { status: 201 });
  } catch (error) {
    console.error("[CREATE_REVIEW_ERROR]", error);
    return supabaseErrorResponse(error, "Could not submit your review.");
  }
}
