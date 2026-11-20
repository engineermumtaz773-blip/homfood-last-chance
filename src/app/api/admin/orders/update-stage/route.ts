import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, updateSupabaseOrder } from "@/lib/supabase-server";
import { requireAdminRequest } from "@/lib/admin-request";
import { supabaseErrorResponse } from "@/lib/api-errors";
import type { DbOrderStatus } from "@/lib/store-db";

export const runtime = "nodejs";
const stageStatuses: Record<string, DbOrderStatus> = {
  received: "pending",
  confirmed: "confirmed",
  preparing: "preparing",
  ready: "ready",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
};

export async function POST(request: NextRequest) {
  const authError = await requireAdminRequest(request);
  if (authError) return authError;
  try {
    const body = await request.json() as { number?: unknown; stage?: unknown; etaMinutes?: unknown };
    if (typeof body.number !== "string" || body.number.trim().length < 4 ||
      typeof body.stage !== "string" || !(body.stage in stageStatuses) ||
      (body.etaMinutes !== undefined && body.etaMinutes !== null && (!Number.isInteger(body.etaMinutes) || Number(body.etaMinutes) < 0 || Number(body.etaMinutes) > 1440))) {
      return NextResponse.json({ error: "Provide a valid order number, kitchen stage, and ETA in minutes." }, { status: 400 });
    }
    assertSupabaseConfigured();
    const etaMinutes = typeof body.etaMinutes === "number" ? body.etaMinutes : null;
    const estimatedDelivery = etaMinutes === null ? null : new Date(Date.now() + etaMinutes * 60_000).toISOString();
    const order = await updateSupabaseOrder(body.number.trim(), stageStatuses[body.stage], {
      kitchenStage: body.stage as NonNullable<Parameters<typeof updateSupabaseOrder>[2]>["kitchenStage"],
      etaMinutes,
      estimatedDelivery,
    });
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json({ order });
  } catch (error) {
    console.error("[UPDATE_ORDER_STAGE_ERROR]", error);
    return supabaseErrorResponse(error, "Kitchen status could not be updated.");
  }
}
