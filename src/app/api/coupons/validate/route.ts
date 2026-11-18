import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, validateSupabaseCoupon } from "@/lib/supabase-server";
import { supabaseErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { code?: unknown; subtotal?: unknown };
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    const subtotal = typeof body.subtotal === "number" && Number.isFinite(body.subtotal) ? body.subtotal : -1;
    if (!/^[A-Z0-9_-]{3,40}$/.test(code) || subtotal < 0) {
      return NextResponse.json({ error: "Enter a valid coupon code and order subtotal." }, { status: 400 });
    }
    assertSupabaseConfigured();
    const coupon = await validateSupabaseCoupon(code);
    if (!coupon) return NextResponse.json({ error: "This coupon is not available." }, { status: 404 });
    const expiration = typeof coupon.expires_at === "string" ? Date.parse(coupon.expires_at) : NaN;
    if (Number.isFinite(expiration) && expiration <= Date.now()) {
      return NextResponse.json({ error: "This coupon has expired." }, { status: 400 });
    }
    const maxUses = typeof coupon.max_uses === "number" ? coupon.max_uses : null;
    const usedCount = Number(coupon.used_count) || 0;
    if (maxUses !== null && usedCount >= maxUses) {
      return NextResponse.json({ error: "This coupon has reached its usage limit." }, { status: 400 });
    }
    const minOrder = Number(coupon.min_order_value) || 0;
    if (subtotal < minOrder) {
      return NextResponse.json({ error: `This coupon requires a minimum order of Rs. ${minOrder.toLocaleString()}.` }, { status: 400 });
    }
    const value = Number(coupon.discount_value);
    const discount = coupon.discount_type === "percentage"
      ? Math.round(subtotal * value / 100)
      : Math.round(value);
    return NextResponse.json({
      code,
      discount: Math.min(subtotal, Math.max(0, discount)),
      message: coupon.discount_type === "percentage" ? `${value}% discount applied.` : `Rs. ${discount} discount applied.`,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[VALIDATE_COUPON_ERROR]", error);
    return supabaseErrorResponse(error, "Could not validate this coupon.");
  }
}
