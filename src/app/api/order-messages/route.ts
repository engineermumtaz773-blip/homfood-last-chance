import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readAdminSession } from "@/lib/admin-session";
import { assertSupabaseConfigured, getSupabaseMessages, getSupabaseOrder, insertSupabaseMessage, insertSupabaseNotification } from "@/lib/supabase-server";

export const runtime = "nodejs";

async function isAdmin() {
  const session = await readAdminSession((await cookies()).get("hmf_admin_session")?.value, process.env.HMF_ADMIN_SESSION_SECRET);
  return Boolean(session);
}

export async function GET(request: NextRequest) {
  try {
    assertSupabaseConfigured();
    const { searchParams } = new URL(request.url);
    const orderNumber = searchParams.get("number")?.trim();
    const phone = searchParams.get("phone")?.trim() || "";
    if (!orderNumber) return NextResponse.json({ error: "Order number is required." }, { status: 400 });
    const admin = await isAdmin();
    if (!admin) {
      const order = await getSupabaseOrder(orderNumber, phone);
      if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    const messages = await getSupabaseMessages(orderNumber);
    return NextResponse.json({ ok: true, messages });
  } catch (error) {
    console.error("[GET_ORDER_MESSAGES_ERROR]", error);
    return NextResponse.json({ error: "Failed to fetch order messages." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSupabaseConfigured();
    const body = await request.json() as { number?: string; phone?: string; sender?: "customer" | "admin"; body?: string };
    const number = body.number?.trim();
    const message = body.body?.trim();
    if (!number || !message || message.length > 1000) return NextResponse.json({ error: "A message up to 1000 characters is required." }, { status: 400 });
    const admin = await isAdmin();
    if (body.sender === "admin" && !admin) return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
    if (body.sender !== "admin") {
      const order = await getSupabaseOrder(number, body.phone || "");
      if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    const sender = body.sender === "admin" ? "admin" : "customer";
    const created = await insertSupabaseMessage({ orderNumber: number, sender, body: message });
    if (sender === "customer") {
      await insertSupabaseNotification({
        type: "chat_message",
        title: `New message for ${number}`,
        body: message,
        orderNumber: number,
        priority: "high",
      });
    }
    return NextResponse.json({ ok: true, message: created });
  } catch (error) {
    console.error("[POST_ORDER_MESSAGE_ERROR]", error);
    return NextResponse.json({ error: "Failed to send order message." }, { status: 500 });
  }
}
