import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, upsertSupabaseCustomer } from "@/lib/supabase-server";
import {
  setCustomerSessionCookie,
  OAUTH_STATE_COOKIE,
  type CustomerSessionPayload,
} from "@/lib/customer-session";

export const runtime = "nodejs";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

function safeScriptJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function redirectToStore(request: NextRequest, code: string) {
  const origin = new URL(request.url).origin;
  const response = NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(code)}`, origin));
  response.cookies.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    const origin = new URL(request.url).origin;
    const redirectUri = `${origin}/api/auth/google/callback`;

    // 1. If Google returned an error (e.g., user clicked cancel/deny)
    if (error) {
      console.warn("[GOOGLE_OAUTH_CALLBACK_ERROR]", error, errorDescription);
      return redirectToStore(request, `google_${error}`);
    }

    if (!code) {
      return redirectToStore(request, "missing_authorization_code");
    }

    // 2. Validate state payload
    const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
    if (!state || !expectedState || state !== expectedState) {
      return redirectToStore(request, "oauth_state_mismatch");
    }

    let targetUrl = "/";
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
        returnUrl?: string; timestamp?: number; nonce?: string;
      };
      if (!decoded.nonce || typeof decoded.timestamp !== "number" || Date.now() - decoded.timestamp > 10 * 60 * 1000 || decoded.timestamp > Date.now() + 30_000) {
        return redirectToStore(request, "oauth_state_expired");
      }
      if (typeof decoded.returnUrl === "string" && decoded.returnUrl.startsWith("/") && !decoded.returnUrl.startsWith("//") && !decoded.returnUrl.startsWith("/\\")) {
        targetUrl = decoded.returnUrl;
      }
    } catch {
      return redirectToStore(request, "oauth_state_invalid");
    }

    const clientId =
      process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error(
        "[GOOGLE_OAUTH_CONFIG_ERROR] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing."
      );
      return redirectToStore(request, "google_credentials_not_configured");
    }

    // 3. Exchange authorization code for Google access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      console.error("[GOOGLE_OAUTH_TOKEN_EXCHANGE_FAILED]", errBody);
      return redirectToStore(request, "google_token_exchange_failed");
    }

    const tokens = (await tokenResponse.json()) as {
      access_token?: string;
      id_token?: string;
    };

    if (!tokens.access_token) {
      return redirectToStore(request, "no_access_token_received");
    }

    // 4. Fetch Google User Profile
    const userinfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );

    if (!userinfoResponse.ok) {
      return redirectToStore(request, "failed_to_fetch_google_userinfo");
    }

    const googleUser = (await userinfoResponse.json()) as {
      sub?: string;
      name?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
      email?: string;
      email_verified?: boolean;
    };

    if (!googleUser.email) {
      return redirectToStore(request, "no_email_associated_with_google_account");
    }

    const normalizedEmail = googleUser.email.trim().toLowerCase();
    const customerName =
      googleUser.name?.trim() ||
      googleUser.given_name?.trim() ||
      normalizedEmail.split("@")[0];
    const customerAvatar = googleUser.picture || "";

    // 5. Upsert customer into persistent database
    assertSupabaseConfigured();
    const dbCustomer = await upsertSupabaseCustomer({
      email: normalizedEmail,
      name: customerName,
      avatarUrl: customerAvatar,
      authProvider: "google",
      emailVerified: true,
    });

    const clientProfile = {
      id: dbCustomer.id,
      name: dbCustomer.name,
      email: dbCustomer.email,
      phone: dbCustomer.phone || "",
      avatarUrl: dbCustomer.avatarUrl || customerAvatar,
      authProvider: "google",
      emailVerified: true,
      addresses: dbCustomer.addresses || ["Bahawalpur City"],
      preferredPayment: "Digital Payment (Raast)",
      createdAt: dbCustomer.createdAt,
    };

    // 6. Generate branded HTML response that sets session and returns to storefront
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authenticating with Google · Home Made Food</title>
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
      max-width: 440px;
      width: 100%;
      border-radius: 28px;
      padding: 36px 30px;
      box-shadow: 0 25px 60px rgba(0,0,0,0.5);
      text-align: center;
      box-sizing: border-box;
    }
    .logo-container {
      position: relative;
      width: 72px;
      height: 72px;
      margin: 0 auto 16px auto;
    }
    .logo-glow {
      position: absolute;
      inset: -4px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(134, 239, 172, 0.6) 0%, rgba(22, 101, 52, 0.2) 70%, transparent 80%);
      filter: blur(8px);
    }
    .logo {
      position: relative;
      width: 72px;
      height: 72px;
      border-radius: 50%;
      border: 3px solid #10b981;
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.5);
      object-fit: cover;
    }
    h1 {
      margin: 0 0 6px 0;
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
    }
    .user-pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 8px 16px;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      border-radius: 20px;
      margin: 14px 0 18px 0;
    }
    .user-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      object-fit: cover;
    }
    .user-name {
      font-size: 14px;
      font-weight: 700;
      color: #065f46;
    }
    p {
      margin: 0 0 16px 0;
      font-size: 14px;
      color: #475569;
    }
    .spinner {
      width: 28px;
      height: 28px;
      border: 3px solid #e2e8f0;
      border-top-color: #10b981;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-container">
      <div class="logo-glow"></div>
      <img src="/image_6c70d8.jpg" alt="Home Made Food" class="logo">
    </div>
    <div style="font-size: 11px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #10b981; margin-bottom: 4px;">
      ✦ GOOGLE AUTHENTICATION SUCCESSFUL
    </div>
    <h1>Welcome, ${escapeHtml(customerName)}</h1>
    
    <div class="user-pill">
      ${customerAvatar ? `<img src="${escapeHtml(customerAvatar)}" alt="" class="user-avatar">` : ""}
      <span class="user-name">${escapeHtml(customerName)}</span>
    </div>

    <p>Signing you in and syncing your preferences...</p>
    <div class="spinner"></div>
  </div>

  <script>
    (function() {
      var profile = ${safeScriptJson(clientProfile)};
      var target = ${safeScriptJson(targetUrl)};

      window.dispatchEvent(new CustomEvent("hmf_customer_auth_changed", { detail: profile }));

      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage({ type: "HMF_GOOGLE_AUTH_SUCCESS", profile: profile }, "*");
          window.close();
          return;
        } catch (e) {}
      }

      setTimeout(function() {
        window.location.replace(target);
      }, 700);
    })();
  </script>
</body>
</html>`;

    const response = new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });

    // 7. Set HTTP-Only Session Cookie for 30 Days
    setCustomerSessionCookie(response, {
      customerId: dbCustomer.id,
      email: dbCustomer.email,
      name: dbCustomer.name,
      verified: true,
      avatarUrl: dbCustomer.avatarUrl,
      authProvider: "google",
    });

    // 8. Clear CSRF state cookie
    response.cookies.set(OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (err) {
    console.error("[GOOGLE_OAUTH_CALLBACK_EXCEPTION]", err);
    return redirectToStore(request, "unexpected_callback_error");
  }
}
