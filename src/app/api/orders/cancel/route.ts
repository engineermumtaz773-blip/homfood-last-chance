import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, getSupabaseOrder, updateSupabaseOrder, insertSupabaseMessage, insertSupabaseNotification } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSupabaseConfigured();
    const body = (await request.json()) as { number?: string; phone?: string; reason?: string };
    const number = body.number?.trim();
    const phone = body.phone?.trim() || "";
    const reason = body.reason?.trim() || "Customer requested cancellation within 2-minute window";

    if (!number) {
      return NextResponse.json({ ok: false, error: "Order number is required." }, { status: 400 });
    }

    const order = await getSupabaseOrder(number, phone);

    if (!order) {
      return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
    }

    if (order.status === "cancelled") {
      return NextResponse.json({ ok: true, message: "Order is already cancelled." });
    }

    // Check 2-minute cancellation window (120 seconds)
    const createdAtTime = new Date(order.createdAt || Date.now()).getTime();
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - createdAtTime) / 1000));

    // Allow 2 minutes (120s) with 15s grace period for network latency = 135s
    if (elapsedSeconds > 135 && order.status !== "pending") {
      return NextResponse.json(
        {
          ok: false,
          error: "The 2-minute cancellation window has elapsed. The kitchen has begun food preparation. Please contact kitchen support on WhatsApp.",
          elapsedSeconds,
        },
        { status: 400 }
      );
    }

    // Update status to cancelled
    const updated = await updateSupabaseOrder(number, "cancelled", {
      notes: `[CANCELLED BY CUSTOMER]: ${reason}`,
    });
    await insertSupabaseMessage({
      orderNumber: number,
      sender: "customer",
      body: `Order cancelled by customer: "${reason}"`,
    });
    await insertSupabaseNotification({
      type: "order_cancelled",
      title: `Order ${number} cancelled`,
      body: reason,
      orderNumber: number,
      priority: "high",
    });

    return NextResponse.json({
      ok: true,
      message: "Order successfully cancelled.",
      order: updated || order,
    });
  } catch (error) {
    console.error("[CANCEL_ORDER_ERROR]", error);
    return NextResponse.json({ ok: false, error: "Failed to cancel order." }, { status: 500 });
  }
}
