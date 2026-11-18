import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, getSupabaseOrder, insertSupabaseNotification, updateSupabaseOrder } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSupabaseConfigured();
    const form = await request.formData();
    const number = String(form.get("number") || "").trim();
    const phone = String(form.get("phone") || "").trim();
    const file = form.get("file");
    if (!number || !phone || !(file instanceof File)) {
      return NextResponse.json({ error: "Order number, phone number, and receipt image are required." }, { status: 400 });
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Upload a JPG, PNG, or WebP receipt under 5 MB." }, { status: 400 });
    }
    const order = await getSupabaseOrder(number, phone);
    if (!order) return NextResponse.json({ error: "Order not found for that phone number." }, { status: 404 });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl || !serviceKey) throw new Error("Supabase Storage is not configured.");
    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const path = `${order.number.replace(/[^a-z0-9_-]/gi, "_")}/${crypto.randomUUID()}.${extension}`;
    const uploadResponse = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/payment-slips/${path}`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": file.type, "x-upsert": "false" },
      body: await file.arrayBuffer(),
      cache: "no-store",
    });
    if (!uploadResponse.ok) {
      const details = await uploadResponse.text();
      throw new Error(`Supabase Storage rejected the receipt (${uploadResponse.status}): ${details}`);
    }
    const updated = await updateSupabaseOrder(order.number, order.status, {
      paymentStatus: "verification_pending",
      paymentSlipUrl: path,
      paymentSlipName: file.name,
    });
    if (!updated) throw new Error("Receipt uploaded but the matching order could not be updated.");
    await insertSupabaseNotification({
      type: "payment_proof",
      title: `Payment slip received for ${order.number}`,
      body: `${order.customerName} uploaded a payment receipt for review.`,
      orderNumber: order.number,
      priority: "high",
    });
    return NextResponse.json({ ok: true, order: updated });
  } catch (error) {
    console.error("[UPLOAD_PAYMENT_SLIP_ERROR]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not upload payment receipt." }, { status: 500 });
  }
}
