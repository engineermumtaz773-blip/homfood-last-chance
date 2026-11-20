import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, getSupabaseOrder } from "@/lib/supabase-server";
import { supabaseErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const number = params.get("number")?.trim() || "";
  const phone = params.get("phone")?.trim() || "";
  if (!number || phone.replace(/\D/g, "").length < 10) {
    return NextResponse.json({ error: "Order number and the checkout phone number are required." }, { status: 400 });
  }
  try {
    assertSupabaseConfigured();
    const order = await getSupabaseOrder(number, phone);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json({ ok: true, order }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[TRACK_ORDER_ERROR]", error);
    return supabaseErrorResponse(error, "Live order tracking is temporarily unavailable.");
  }
}
