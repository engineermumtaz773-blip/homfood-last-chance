import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  adminLockoutMessage,
  createAdminAuthScopes,
  getClientIp,
  isSameOriginAdminRequest,
  isLocalAdminFallbackRequest,
  isAdminRedisUnconfigured,
  isAdminTemporarilyBlocked,
  logAdminSecurityEvent,
  recordAdminFailure,
  clearAdminFailures,
  consumeAdminOtpChallenge,
} from "@/lib/admin-auth-security";
import {
  challengeCookieName,
  cookieName,
  createAdminSession,
  readAdminLoginChallenge,
  sessionLifetimeSeconds,
  DEFAULT_ADMIN_SECRET,
  isAuthorizedAdminEmail,
} from "@/lib/admin-session";
import { getAdminApiUrl, getAdminCredentials, isAdminBackendUnconfigured } from "@/lib/admin-backend";

export const runtime = "nodejs";

const genericFailureMessage = "The verification code is incorrect or has expired.";

function clearChallengeCookie(response: NextResponse) {
  response.cookies.set(challengeCookieName, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/admin",
    maxAge: 0,
  });
}

async function failureResponse(scopes: ReturnType<typeof createAdminAuthScopes>, ip: string, useLocalStore: boolean) {
  const result = await recordAdminFailure(scopes, useLocalStore);
  if (result.blocked) {
    logAdminSecurityEvent("admin_otp_temporarily_blocked", ip, true);
    return NextResponse.json(
      { ok: false, message: adminLockoutMessage },
      { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds), "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: false, message: genericFailureMessage },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

async function handlePost(request: NextRequest) {
  if (!isSameOriginAdminRequest(request)) {
    return NextResponse.json({ ok: false, message: "Invalid verification request." }, { status: 403 });
  }

  const sessionSecret = process.env.HMF_ADMIN_SESSION_SECRET || DEFAULT_ADMIN_SECRET;
  const apiUrl = getAdminApiUrl();
  const credentials = getAdminCredentials();
  const ip = getClientIp(request) || "127.0.0.1";
  const localFallback = isLocalAdminFallbackRequest(request, ip);
  const useLocalStore = isAdminRedisUnconfigured() || localFallback;
  const useLocalWordPress = isAdminBackendUnconfigured() || !apiUrl || !credentials;

  const challenge = await readAdminLoginChallenge(
    request.cookies.get(challengeCookieName)?.value,
    sessionSecret,
  );
  const scopes = createAdminAuthScopes(ip, challenge ? challenge.email : false, sessionSecret);

  try {
    if (await isAdminTemporarilyBlocked(scopes, useLocalStore)) {
      logAdminSecurityEvent("admin_otp_blocked_request", ip, true);
      return NextResponse.json(
        { ok: false, message: adminLockoutMessage },
        { status: 429, headers: { "Retry-After": "900", "Cache-Control": "no-store" } },
      );
    }
  } catch (error) {
    console.error("Could not check admin OTP lockout store.", error);
  }

  if (!challenge) {
    try {
      const result = await failureResponse(scopes, ip, useLocalStore);
      clearChallengeCookie(result);
      return result;
    } catch (error) {
      console.error("Could not record an invalid or expired admin OTP challenge.", error);
      return NextResponse.json({ ok: false, message: genericFailureMessage }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    try {
      return await failureResponse(scopes, ip, useLocalStore);
    } catch {
      return NextResponse.json({ ok: false, message: genericFailureMessage }, { status: 401 });
    }
  }
  const code = typeof body === "object" && body !== null && !Array.isArray(body) &&
    "code" in body && typeof body.code === "string" ? body.code.trim() : "";
  if (!/^\d{6}$/.test(code)) {
    try {
      return await failureResponse(scopes, ip, useLocalStore);
    } catch {
      return NextResponse.json({ ok: false, message: genericFailureMessage }, { status: 401 });
    }
  }

  const suppliedDigest = createHmac("sha256", sessionSecret).update(`${challenge.id}:${code}`).digest();
  const expectedDigest = Buffer.from(challenge.otpDigest, "hex");
  if (suppliedDigest.length !== expectedDigest.length || !timingSafeEqual(suppliedDigest, expectedDigest)) {
    try {
      return await failureResponse(scopes, ip, useLocalStore);
    } catch {
      return NextResponse.json({ ok: false, message: genericFailureMessage }, { status: 401 });
    }
  }

  let adminUserId = 1;
  if (!useLocalWordPress && apiUrl && credentials) {
    const authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.applicationPassword}`, "utf8").toString("base64")}`;
    try {
      const response = await fetch(`${apiUrl}/hmf/v1/auth`, {
        headers: { Authorization: authorization },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) {
        const identity = await response.json() as Record<string, unknown>;
        if (identity && typeof identity.id === "number" && identity.id >= 1) {
          adminUserId = identity.id;
        }
      }
    } catch (error) {
      console.warn("Optional WordPress admin verification skipped on verify-otp:", error);
    }
  }

  try {
    await consumeAdminOtpChallenge(challenge.id, challenge.nonce, useLocalStore);
    await clearAdminFailures(scopes, useLocalStore);
    const token = await createAdminSession({
      userId: adminUserId,
      email: challenge.email,
    }, sessionSecret);
    const result = NextResponse.json({ ok: true, email: challenge.email });
    result.cookies.set(cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: sessionLifetimeSeconds,
    });
    clearChallengeCookie(result);
    return result;
  } catch (error) {
    console.error("Could not complete verified admin sign-in.", error);
    return NextResponse.json({ ok: false, message: "Secure admin sign-in could not be completed." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    return await handlePost(request);
  } catch (error) {
    console.error("Unexpected error in admin OTP verification endpoint.", error);
    return NextResponse.json(
      { ok: false, message: "Secure admin sign-in is temporarily unavailable." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
