import { NextRequest, NextResponse } from "next/server";
import { POST as uploadSlip } from "../../upload-slip/route";
import { getSupabaseOrder } from "@/lib/supabase-server";
import { requireAdminRequest } from "@/lib/admin-request";
import { getPaymentSlipStoragePath } from "@/lib/payment-slip-path";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authError = await requireAdminRequest(request);
  if (authError) return authError;

  const number = new URL(request.url).searchParams.get("number")?.trim();
  if (!number) return NextResponse.json({ error: "Order number is required." }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Payment receipt storage is unavailable." }, { status: 503 });
  }

  try {
    const order = await getSupabaseOrder(number);
    if (!order?.paymentSlipUrl) return NextResponse.json({ error: "Payment receipt not found." }, { status: 404 });
    const path = getPaymentSlipStoragePath(order.paymentSlipUrl, supabaseUrl);
    if (!path) return NextResponse.json({ error: "Payment receipt path is invalid." }, { status: 404 });

    const response = await fetch(
      `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/payment-slips/${path}`,
      {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      console.error("[PAYMENT_SLIP_READ_ERROR]", response.status);
      return NextResponse.json({ error: "Payment receipt is temporarily unavailable." }, { status: 503 });
    }

    return new NextResponse(await response.arrayBuffer(), {
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[PAYMENT_SLIP_READ_ERROR]", error);
    return NextResponse.json({ error: "Payment receipt is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  return uploadSlip(request);
}
