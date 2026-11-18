import { NextResponse } from "next/server";
import { assertSupabaseConfigured, getSupabaseDeliveryZones } from "@/lib/supabase-server";
import { supabaseErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    assertSupabaseConfigured();
    const zones = await getSupabaseDeliveryZones();
    return NextResponse.json({ zones }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[GET_DELIVERY_ZONES_ERROR]", error);
    return supabaseErrorResponse(error, "Delivery zones are temporarily unavailable.");
  }
}
