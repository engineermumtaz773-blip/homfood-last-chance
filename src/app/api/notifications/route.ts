import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { assertSupabaseConfigured, getSupabaseNotifications } from "@/lib/supabase-server";
import { readAdminSession } from "@/lib/admin-session";

export const runtime = "nodejs";

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
