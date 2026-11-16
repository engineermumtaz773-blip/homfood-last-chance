import { NextResponse, type NextRequest } from "next/server";
import { cookieName, readAdminSession } from "@/lib/admin-session";

export async function hasAdminSession(request: NextRequest) {
  const session = await readAdminSession(
    request.cookies.get(cookieName)?.value,
    process.env.HMF_ADMIN_SESSION_SECRET,
  );
  return session !== null;
}

export async function requireAdminRequest(request: NextRequest) {
  return await hasAdminSession(request)
    ? null
    : NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
}
