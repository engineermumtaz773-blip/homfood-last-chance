import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, getSupabaseOrder, insertSupabaseNotification, updateSupabaseOrder } from "@/lib/supabase-server";
import { getPaymentSlipStoragePath } from "@/lib/payment-slip-path";

export const runtime = "nodejs";
const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

function isValidImageSignature(bytes: Uint8Array, contentType: string) {
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

function getStorageConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) throw new Error("Supabase Storage is not configured.");
  return { supabaseUrl: supabaseUrl.replace(/\/+$/, ""), serviceKey };
}

export async function POST(request: NextRequest) {
  try {
    assertSupabaseConfigured();
    const form = await request.formData();
    const number = String(form.get("number") || "").trim();
    const phone = String(form.get("phone") || "").trim();
    const file = form.get("file");
    if (!number || phone.replace(/\D/g, "").length < 10 || !(file instanceof File)) {
      return NextResponse.json({ error: "Order number, valid phone number, and receipt image are required." }, { status: 400 });
    }
    if (!allowedTypes.includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Upload a JPG, PNG, or WebP receipt under 5 MB." }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (!isValidImageSignature(bytes, file.type)) {
      return NextResponse.json({ error: "The uploaded file does not match its image format." }, { status: 400 });
    }

    const order = await getSupabaseOrder(number, phone);
    if (!order) return NextResponse.json({ error: "Order not found for that phone number." }, { status: 404 });
    const { supabaseUrl, serviceKey } = getStorageConfig();
    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const path = `${order.number.replace(/[^a-z0-9_-]/gi, "_")}/${crypto.randomUUID()}.${extension}`;
    const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/payment-slips/${path}`, {
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
      paymentSlipName: file.name.slice(0, 255),
    });
    if (!updated) throw new Error("Receipt uploaded but the matching order could not be updated.");
    if (order.paymentSlipUrl) {
      const previousPath = getPaymentSlipStoragePath(order.paymentSlipUrl, supabaseUrl);
      if (previousPath && previousPath !== path) {
        const removePrevious = await fetch(`${supabaseUrl}/storage/v1/object/payment-slips/${previousPath}`, {
          method: "DELETE",
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          cache: "no-store",
        });
        if (!removePrevious.ok && removePrevious.status !== 404) {
          console.error("[REPLACED_PAYMENT_SLIP_CLEANUP_ERROR]", { status: removePrevious.status, orderNumber: order.number });
        }
      }
    }
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

export async function DELETE(request: NextRequest) {
  try {
    assertSupabaseConfigured();
    const { searchParams } = new URL(request.url);
    const number = searchParams.get("number")?.trim() || "";
    const phone = searchParams.get("phone")?.trim() || "";
    if (!number || phone.replace(/\D/g, "").length < 10) {
      return NextResponse.json({ error: "Order number and valid customer phone are required." }, { status: 400 });
    }
    const order = await getSupabaseOrder(number, phone);
    if (!order) return NextResponse.json({ error: "Order not found for that phone number." }, { status: 404 });
    if (!order.paymentSlipUrl) return NextResponse.json({ ok: true });

    const { supabaseUrl, serviceKey } = getStorageConfig();
    const path = getPaymentSlipStoragePath(order.paymentSlipUrl, supabaseUrl);
    if (!path) {
      return NextResponse.json({ error: "Payment receipt path is invalid." }, { status: 409 });
    }
    const storageResponse = await fetch(`${supabaseUrl}/storage/v1/object/payment-slips/${path}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      cache: "no-store",
    });
    if (!storageResponse.ok && storageResponse.status !== 404) {
      throw new Error(`Supabase Storage rejected receipt removal (${storageResponse.status}).`);
    }
    const updated = await updateSupabaseOrder(order.number, order.status, {
      paymentStatus: "pending",
      paymentSlipUrl: "",
      paymentSlipName: "",
    });
    if (!updated) throw new Error("Receipt was removed but the order could not be updated.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[REMOVE_PAYMENT_SLIP_ERROR]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove payment receipt." }, { status: 500 });
  }
}
