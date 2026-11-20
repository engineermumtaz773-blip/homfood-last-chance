import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { assertSupabaseConfigured, getSupabaseNotifications } from "@/lib/supabase-server";
import { readAdminSession } from "@/lib/admin-session";
import { insertSupabaseNotification } from "@/lib/supabase-server";
import { isSameOriginAdminRequest } from "@/lib/admin-auth-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginAdminRequest(request)) {
    return NextResponse.json({ error: "Please submit this request from the Home Made Food website." }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a valid notification request." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Send a valid notification request." }, { status: 400 });
  }
  const values = body as { name?: unknown; phone?: unknown; message?: unknown; website?: unknown };
  if (typeof values.website === "string" && values.website.trim()) {
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }
  const name = typeof values.name === "string" ? values.name.trim() : "";
  const phone = typeof values.phone === "string" ? values.phone.trim() : "";
  const message = typeof values.message === "string" ? values.message.trim() : "";
  if (name.length < 2 || name.length > 80 || !/^[+\d() -]{7,24}$/.test(phone) || message.length < 2 || message.length > 1200) {
    return NextResponse.json({ error: "Enter a name, valid phone number, and a message under 1,200 characters." }, { status: 400 });
  }
  try {
    assertSupabaseConfigured();
    await insertSupabaseNotification({
      type: "contact_request",
      title: `New website request from ${name}`,
      body: `Phone: ${phone}\n${message}`,
      priority: "high",
    });
    return NextResponse.json({ ok: true, message: "Your request was sent to the Admin Panel." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[POST_CONTACT_NOTIFICATION_ERROR]", error);
    return NextResponse.json({ error: "The Admin Panel could not receive your request. Please try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = await readAdminSession(cookieStore.get("hmf_admin_session")?.value, process.env.HMF_ADMIN_SESSION_SECRET);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const unreadOnly = new URL(request.url).searchParams.get("unread") === "true";
  try {
    assertSupabaseConfigured();
    const notifications = await getSupabaseNotifications(unreadOnly) as Array<{ read?: boolean }>;
    return NextResponse.json({
      ok: true,
      notifications,
      unread: unreadOnly ? notifications.length : notifications.filter((notification) => !notification.read).length,
    });
  } catch (error) {
    console.error("[GET_NOTIFICATIONS_ERROR]", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}
