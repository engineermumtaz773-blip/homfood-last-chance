import { NextRequest, NextResponse } from "next/server";
import { getSupabaseOrder, assertSupabaseConfigured } from "@/lib/supabase-server";
import { supabaseErrorResponse } from "@/lib/api-errors";
import { getPaymentSlipStoragePath } from "@/lib/payment-slip-path";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    assertSupabaseConfigured();
    const { searchParams } = new URL(request.url);
    const number = searchParams.get("number")?.trim() || "";
    const phone = searchParams.get("phone")?.trim() || "";
    if (!number || phone.replace(/\D/g, "").length < 10) {
      return NextResponse.json({ error: "Order number and valid customer phone are required." }, { status: 400 });
    }

    const order = await getSupabaseOrder(number, phone);
    if (!order?.paymentSlipUrl) return NextResponse.json({ error: "Payment receipt not found." }, { status: 404 });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl || !serviceKey) return NextResponse.json({ error: "Payment receipt storage is unavailable." }, { status: 503 });
    const path = getPaymentSlipStoragePath(order.paymentSlipUrl, supabaseUrl);
    if (!path) {
      return NextResponse.json({ error: "Payment receipt path is invalid." }, { status: 404 });
    }

    const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/payment-slips/${path}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return NextResponse.json({ error: "Payment receipt is temporarily unavailable." }, { status: 503 });

    return new NextResponse(await response.arrayBuffer(), {
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[CUSTOMER_PAYMENT_SLIP_READ_ERROR]", error);
    return supabaseErrorResponse(error, "Payment receipt is temporarily unavailable.");
  }
}
