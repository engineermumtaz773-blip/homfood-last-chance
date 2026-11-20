import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, insertSupabaseFunnelEvent } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedEvents = new Set([
  "menu_loaded",
  "add_to_cart",
  "checkout_started",
  "order_placed",
  "receipt_uploaded",
  "order_tracked",
]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { event?: unknown; metadata?: unknown };
    if (typeof body.event !== "string" || !allowedEvents.has(body.event)) {
      return NextResponse.json({ error: "Unsupported funnel event." }, { status: 400 });
    }
    const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? body.metadata as Record<string, unknown>
      : {};
    const safeMetadata: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(metadata).slice(0, 8)) {
      if (!/^[a-z_]{1,40}$/u.test(key)) continue;
      if (typeof value === "string" && value.length <= 120) safeMetadata[key] = value;
      else if (typeof value === "number" && Number.isFinite(value)) safeMetadata[key] = value;
      else if (typeof value === "boolean") safeMetadata[key] = value;
    }
    assertSupabaseConfigured();
    await insertSupabaseFunnelEvent(body.event, safeMetadata);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[FUNNEL_EVENT_ERROR]", error);
    return NextResponse.json({ error: "Funnel event could not be recorded." }, { status: 503 });
  }
}
