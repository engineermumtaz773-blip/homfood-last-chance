import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readAdminSession } from "@/lib/admin-session";
import { assertSupabaseConfigured, getSupabaseMessages, getSupabaseOrder, insertSupabaseMessage, insertSupabaseNotification } from "@/lib/supabase-server";
import { CUSTOMER_SESSION_COOKIE, verifySignedCustomerSession } from "@/lib/customer-session";
import { supabaseErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

async function isAdmin() {
  const session = await readAdminSession((await cookies()).get("hmf_admin_session")?.value, process.env.HMF_ADMIN_SESSION_SECRET);
  return Boolean(session);
}

async function getCustomerOrder(request: NextRequest, reference: string, phone: string) {
  const phoneMatch = phone ? await getSupabaseOrder(reference, phone) : null;
  if (phoneMatch) return phoneMatch;

  const session = verifySignedCustomerSession(request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value);
  if (!session?.verified || session.exp <= Math.floor(Date.now() / 1000)) return null;
  const order = await getSupabaseOrder(reference);
  if (!order) return null;
  const ownsByEmail = Boolean(session.email && order.customerEmail?.toLowerCase() === session.email.toLowerCase());
  const sessionPhone = session.phone?.replace(/\D/g, "").slice(-10);
  const ownsByPhone = Boolean(sessionPhone && sessionPhone.length === 10 && order.customerPhone.replace(/\D/g, "").endsWith(sessionPhone));
  return ownsByEmail || ownsByPhone ? order : null;
}

export async function GET(request: NextRequest) {
  try {
    assertSupabaseConfigured();
    const { searchParams } = new URL(request.url);
    const orderNumber = searchParams.get("number")?.trim();
    const phone = searchParams.get("phone")?.trim() || "";
    if (!orderNumber) return NextResponse.json({ error: "Order number is required." }, { status: 400 });
    const admin = await isAdmin();
    const order = admin
      ? await getSupabaseOrder(orderNumber)
      : await getCustomerOrder(request, orderNumber, phone);
    if (!order) return NextResponse.json({ error: "Order not found for this customer." }, { status: 404 });
    const messages = await getSupabaseMessages(order.number);
    return NextResponse.json({ ok: true, messages });
  } catch (error) {
    console.error("[GET_ORDER_MESSAGES_ERROR]", error);
    return supabaseErrorResponse(error, "Failed to fetch order messages.");
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
    const order = body.sender === "admin"
      ? await getSupabaseOrder(number)
      : await getCustomerOrder(request, number, body.phone || "");
    if (!order) return NextResponse.json({ error: "Order not found for this customer." }, { status: 404 });
    const sender = body.sender === "admin" ? "admin" : "customer";
    const created = await insertSupabaseMessage({ orderNumber: order.number, sender, body: message });
    const warnings: string[] = [];
    if (sender === "customer") {
      try {
        await insertSupabaseNotification({
          type: "chat_message",
          title: `New message for ${order.number}`,
          body: message,
          orderNumber: order.number,
          priority: "high",
        });
      } catch (error) {
        console.error("[ORDER_MESSAGE_NOTIFICATION_ERROR]", { orderNumber: order.number, error });
        warnings.push("Message sent, but the kitchen notification could not be created.");
      }
    }
    return NextResponse.json({ ok: true, message: created, warnings });
  } catch (error) {
    console.error("[POST_ORDER_MESSAGE_ERROR]", error);
    return supabaseErrorResponse(error, "Failed to send order message.");
  }
}
