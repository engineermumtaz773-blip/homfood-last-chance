import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomInt, randomUUID } from "node:crypto";
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
  releaseAdminOtpChallenge,
  reserveAdminOtpChallenge,
  consumeAdminOtpChallenge,
} from "@/lib/admin-auth-security";
import { isAdminOtpMailerConfigured, sendAdminOtpEmail } from "@/lib/admin-otp-email";
import {
  challengeCookieName,
  challengeLifetimeSeconds,
  cookieName,
  createAdminLoginChallenge,
  readAdminLoginChallenge,
  DEFAULT_ADMIN_SECRET,
  isAuthorizedAdminEmail,
} from "@/lib/admin-session";
import { getAdminApiUrl, getAdminCredentials, isAdminBackendUnconfigured } from "@/lib/admin-backend";

export const runtime = "nodejs";

const invalidEmailMessage = "Invalid email / Access denied";
const nonceLifetimeSeconds = challengeLifetimeSeconds;

function setChallengeCookie(response: NextResponse, token: string) {
  response.cookies.set(challengeCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/admin",
    maxAge: challengeLifetimeSeconds,
  });
}

function clearChallengeCookie(response: NextResponse) {
  response.cookies.set(challengeCookieName, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/admin",
    maxAge: 0,
  });
}

async function failureResponse(
  scopes: ReturnType<typeof createAdminAuthScopes>,
  ip: string,
  useLocalStore: boolean,
  message = invalidEmailMessage,
) {
  const result = await recordAdminFailure(scopes, useLocalStore);
  if (result.blocked) {
    logAdminSecurityEvent("admin_sign_in_temporarily_blocked", ip, true);
    return NextResponse.json(
      { ok: false, message: adminLockoutMessage },
      { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds), "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: false, message },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

async function handlePost(request: NextRequest) {
  if (!isSameOriginAdminRequest(request)) {
    return NextResponse.json({ ok: false, message: "Invalid sign-in request." }, { status: 403 });
  }

  const sessionSecret = process.env.HMF_ADMIN_SESSION_SECRET || DEFAULT_ADMIN_SECRET;
  const ip = getClientIp(request) || "127.0.0.1";
  const localFallback = isLocalAdminFallbackRequest(request, ip);
  const useLocalStore = isAdminRedisUnconfigured() || localFallback;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Enter the authorized admin email address." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ ok: false, message: "Enter the authorized admin email address." }, { status: 400 });
  }

  const email = "email" in body && typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const authorized = isAuthorizedAdminEmail(email);
  const scopes = createAdminAuthScopes(ip, authorized ? email : false, sessionSecret);

  try {
    if (await isAdminTemporarilyBlocked(scopes, useLocalStore)) {
      logAdminSecurityEvent("admin_sign_in_blocked_request", ip, true);
      return NextResponse.json(
        { ok: false, message: adminLockoutMessage },
        { status: 429, headers: { "Retry-After": "900", "Cache-Control": "no-store" } },
      );
    }
  } catch (error) {
    console.error("Could not check admin sign-in lockout store.", error);
  }

  if (!authorized) {
    try {
      return await failureResponse(scopes, ip, useLocalStore);
    } catch (error) {
      console.error("Could not record a failed admin sign-in attempt.", error);
      return NextResponse.json({ ok: false, message: invalidEmailMessage }, { status: 401 });
    }
  }

  const apiUrl = getAdminApiUrl();
  const credentials = getAdminCredentials();
  const mailerConfigured = isAdminOtpMailerConfigured();
  const useLocalWordPress = isAdminBackendUnconfigured() || !apiUrl || !credentials;

  const previousChallenge = await readAdminLoginChallenge(
    request.cookies.get(challengeCookieName)?.value,
    sessionSecret,
  );
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
        if (identity && typeof identity.email === "string" && !isAuthorizedAdminEmail(identity.email)) {
          console.warn("Configured WordPress admin does not match allowed admin emails.");
        }
      }
    } catch (error) {
      console.warn("Optional WordPress admin verification skipped:", error);
    }
  }

  const id = randomUUID();
  const nonce = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const otpDigestHex = createHmac("sha256", sessionSecret).update(`${id}:${code}`).digest("hex");
  try {
    const challenge = await createAdminLoginChallenge({
      id,
      nonce,
      email,
      otpDigest: otpDigestHex,
    }, sessionSecret);

    const reserved = await reserveAdminOtpChallenge(scopes, id, nonce, nonceLifetimeSeconds, useLocalStore);
    if (!reserved) {
      return NextResponse.json(
        { ok: false, message: "Please wait for the 60-second timer before requesting another code." },
        { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } },
      );
    }

    if (!mailerConfigured) {
      console.warn(`[ADMIN OTP] ${email}: ${code} (expires in 10 minutes)`);
    } else {
      try {
        await sendAdminOtpEmail(code);
      } catch (releaseError) {
        console.error("Could not deliver the admin verification email.", releaseError);
      }
    }

    if (previousChallenge) {
      try {
        await consumeAdminOtpChallenge(previousChallenge.id, previousChallenge.nonce, useLocalStore);
      } catch (error) {
        console.warn("Could not invalidate previous admin OTP challenge:", error);
      }
    }

    const localDevCode = !mailerConfigured || process.env.NODE_ENV !== "production" ? code : undefined;
    const result = NextResponse.json({
      ok: true,
      message: mailerConfigured
        ? `A 6-digit verification code has been sent to ${email}.`
        : `Admin verification code generated for ${email}.`,
      ...(localDevCode ? { devCode: localDevCode } : {}),
    });
    setChallengeCookie(result, challenge);
    return result;
  } catch (error) {
    console.error("Could not create admin sign-in challenge:", error);
    try {
      await releaseAdminOtpChallenge(scopes, id, nonce, useLocalStore);
    } catch {
      // ignore
    }
    return NextResponse.json({ ok: false, message: "Secure admin sign-in could not be completed." }, { status: 503 });
  }
}

async function handleDelete(request: NextRequest) {
  if (!isSameOriginAdminRequest(request)) {
    return NextResponse.json({ ok: false, message: "Invalid sign-out request." }, { status: 403 });
  }
  const ip = getClientIp(request) || "127.0.0.1";
  const useLocalStore = isAdminRedisUnconfigured();
  const sessionSecret = process.env.HMF_ADMIN_SESSION_SECRET || DEFAULT_ADMIN_SECRET;
  const challenge = await readAdminLoginChallenge(
    request.cookies.get(challengeCookieName)?.value,
    sessionSecret,
  );
  if (challenge) {
    try {
      await consumeAdminOtpChallenge(challenge.id, challenge.nonce, useLocalStore);
    } catch (error) {
      console.warn("Could not consume challenge on sign out:", error);
    }
  }
  const response = NextResponse.json({ ok: true });
  clearChallengeCookie(response);
  return response;
}

export async function POST(request: NextRequest) {
  return handlePost(request);
}

export async function DELETE(request: NextRequest) {
  return handleDelete(request);
}
