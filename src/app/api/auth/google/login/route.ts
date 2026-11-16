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

    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
    const protocol = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const origin = `${protocol}://${host}`;
    const redirectUri = `${origin}/api/auth/google/callback`;

    if (!clientId || clientId.trim().length === 0) {
      const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google Sign-In · Home Made Food</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      background: linear-gradient(135deg, #0d261a 0%, #173f2b 100%);
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .card {
      background: #ffffff;
      color: #0f172a;
      max-width: 460px;
      width: 100%;
      border-radius: 28px;
      padding: 36px 30px;
      box-shadow: 0 25px 60px rgba(0,0,0,0.5);
      text-align: center;
      box-sizing: border-box;
    }
    .logo {
      width: 68px;
      height: 68px;
      border-radius: 50%;
      border: 3px solid #10b981;
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.45);
      object-fit: cover;
      margin-bottom: 16px;
    }
    h1 {
      margin: 0 0 8px 0;
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.3px;
    }
    p {
      margin: 0 0 20px 0;
      font-size: 14px;
      line-height: 1.6;
      color: #475569;
    }
    .info-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 16px 18px;
      text-align: left;
      font-size: 12px;
      color: #334155;
      margin-bottom: 24px;
      word-break: break-all;
      line-height: 1.6;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 14px 20px;
      border-radius: 14px;
      border: none;
      font-size: 14px;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
      box-sizing: border-box;
      margin-bottom: 10px;
      transition: all 0.2s ease;
    }
    .btn-primary {
      background: linear-gradient(135deg, #173f2b 0%, #1f563b 100%);
      color: #ffffff;
      box-shadow: 0 4px 14px rgba(23, 63, 43, 0.3);
    }
    .btn-secondary {
      background: #f1f5f9;
      color: #334155;
    }
  </style>
</head>
<body>
  <div class="card">
    <img src="/image_6c70d8.jpg" alt="Home Made Food Logo" class="logo">
    <h1>Google OAuth Configuration</h1>
    <p>Real Google OAuth requires client credentials configured in your environment or Vercel dashboard.</p>
    <div class="info-box">
      <strong>Authorized Redirect URI:</strong><br>
      <code style="color: #059669; font-weight: 700;">${redirectUri}</code><br><br>
      <strong>Required Environment Variables:</strong><br>
      • <code>GOOGLE_CLIENT_ID</code><br>
      • <code>GOOGLE_CLIENT_SECRET</code>
    </div>
    <a href="/?open_auth=email" class="btn btn-primary"><span>Continue with Email OTP</span> <span>→</span></a>
    <a href="/" class="btn btn-secondary"><span>Return to Storefront</span></a>
  </div>
</body>
</html>`;
      return new NextResponse(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

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

    const response = NextResponse.redirect(authUrl.toString());
    response.cookies.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });

    return response;
  } catch (err) {
    console.error("[GOOGLE_OAUTH_LOGIN_ERROR]", err);
    return NextResponse.redirect(new URL("/?auth_error=google_failed", request.url));
  }
}
