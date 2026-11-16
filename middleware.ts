import { NextRequest, NextResponse } from "next/server";
import { cookieName, verifyAdminSession } from "@/lib/admin-session";

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/admin/login") return NextResponse.next();

  const validSession = await verifyAdminSession(
    request.cookies.get(cookieName)?.value,
    process.env.HMF_ADMIN_SESSION_SECRET,
  );
  if (validSession) return NextResponse.next();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/admin/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*"],
};
