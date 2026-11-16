import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { OAUTH_STATE_COOKIE } from "@/lib/customer-session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get("mode") || "login";
    const returnUrl = searchParams.get("returnUrl") || "/";

    // Compute redirect URI matching deployment origin
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
    const protocol = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const origin = `${protocol}://${host}`;
    const redirectUri = `${origin}/api/auth/google/callback`;

    if (!clientId || clientId.trim().length === 0) {
      return NextResponse.json(
        {
          ok: false,
          setupRequired: true,
          error:
            "Google Sign-In is temporarily awaiting Google Cloud OAuth Client credentials. Please use Email OTP to sign in or add GOOGLE_CLIENT_ID in Vercel environment.",
          redirectUri,
        },
        { status: 503 }
      );
    }

    // CSRF Protection with secure nonce
    const nonce = randomBytes(16).toString("hex");
    const statePayload = {
      nonce,
      mode,
      returnUrl: returnUrl.startsWith("/") ? returnUrl : "/",
      timestamp: Date.now(),
    };
    const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId.trim());
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "select_account");
    authUrl.searchParams.set("state", state);

    const response = NextResponse.json({
      ok: true,
      url: authUrl.toString(),
      redirectUri,
    });

    response.cookies.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600, // 10 minutes
    });

    return response;
  } catch (err) {
    console.error("[GOOGLE_OAUTH_URL_ERROR]", err);
    return NextResponse.json(
      { ok: false, error: "Failed to generate Google Sign-In URL." },
      { status: 500 }
    );
  }
}
