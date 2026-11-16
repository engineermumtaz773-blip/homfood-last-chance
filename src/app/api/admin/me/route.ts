import { NextRequest, NextResponse } from "next/server";
import { cookieName, readAdminSession, DEFAULT_ADMIN_SECRET } from "@/lib/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sessionSecret = process.env.HMF_ADMIN_SESSION_SECRET || DEFAULT_ADMIN_SECRET;
    const sessionToken = request.cookies.get(cookieName)?.value;
    const session = await readAdminSession(sessionToken, sessionSecret);

    if (!session || !session.email) {
      return NextResponse.json(
        { authenticated: false, message: "Admin privileges required" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      email: session.email,
      userId: session.userId,
    });
  } catch (error) {
    console.error("Admin session verification failed:", error);
    return NextResponse.json(
      { authenticated: false, message: "Authentication check error" },
      { status: 500 }
    );
  }
}
