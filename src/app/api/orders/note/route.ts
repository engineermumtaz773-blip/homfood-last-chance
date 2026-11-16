import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, getSupabaseOrder, insertSupabaseNotification, updateSupabaseOrder } from "@/lib/supabase-server";
import { supabaseErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSupabaseConfigured();
    const body = await request.json() as { number?: string; phone?: string; note?: string };
    const number = body.number?.trim();
    const phone = body.phone?.trim();
    const note = body.note?.trim() || "";
    if (!number || !phone || note.length > 500) return NextResponse.json({ error: "Order number, phone, and a note up to 500 characters are required." }, { status: 400 });
    const order = await getSupabaseOrder(number, phone);
    if (!order) return NextResponse.json({ error: "Order not found for that phone number." }, { status: 404 });
    const updated = await updateSupabaseOrder(order.number, order.status, { customerNote: note });
    if (!updated) return NextResponse.json({ error: "Order could not be updated." }, { status: 409 });
    await insertSupabaseNotification({ type: "customer_note", title: `Customer note for ${order.number}`, body: note || "Customer cleared their delivery note.", orderNumber: order.number, priority: "normal" });
    return NextResponse.json({ ok: true, order: updated });
  } catch (error) {
    console.error("[SAVE_CUSTOMER_ORDER_NOTE_ERROR]", error);
    return supabaseErrorResponse(error, "Could not save delivery note");
  }
}
