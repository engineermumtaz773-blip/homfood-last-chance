import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { POST as handleEmailOtpPost } from "../email-otp/route";

export const runtime = "nodejs";

const sessionCookieName = "hmf_phone_session";
const sessionLifetimeSeconds = 60 * 60 * 24 * 30;
let developmentSessionSecret: string | undefined;

function normalizePhone(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const digits = trimmed.replace(/[\s().-]/g, "");
  const international = digits.startsWith("+") ? digits : digits.startsWith("0") ? `+92${digits.slice(1)}` : digits.startsWith("92") ? `+${digits}` : `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(international) ? international : null;
}

function twilioCredentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!accountSid || !authToken || !serviceSid) return null;
  return { accountSid, authToken, serviceSid };
}

async function twilioRequest(path: "Verifications" | "VerificationCheck", values: Record<string, string>) {
  const credentials = twilioCredentials();
  if (!credentials) return null;
  const response = await fetch(`https://verify.twilio.com/v2/Services/${credentials.serviceSid}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(values),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => ({})) as { status?: string; message?: string };
  return { ok: response.ok, status: payload.status, message: payload.message };
}

function signedSession(phone: string) {
  const secret = getSessionSecret();
  if (!secret) throw new Error("HMF_AUTH_SESSION_SECRET must contain at least 32 characters.");
  const payload = Buffer.from(JSON.stringify({ phone, exp: Math.floor(Date.now() / 1000) + sessionLifetimeSeconds })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function getSessionSecret() {
  const configured = process.env.HMF_AUTH_SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") return null;
  developmentSessionSecret ??= randomBytes(32).toString("base64url");
  return developmentSessionSecret;
}

function setSessionCookie(response: NextResponse, phone: string) {
  response.cookies.set(sessionCookieName, signedSession(phone), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionLifetimeSeconds,
  });
}

function readPhoneSession(request: NextRequest) {
  const token = request.cookies.get(sessionCookieName)?.value;
  const secret = getSessionSecret();
  if (!token || !secret) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { phone?: unknown; exp?: unknown };
    if (typeof value.phone !== "string" || typeof value.exp !== "number" || value.exp <= Math.floor(Date.now() / 1000)) return null;
    return { phone: value.phone };
  } catch { return null; }
}

export async function POST(request: NextRequest) {
  let body: { action?: unknown; phone?: unknown; code?: unknown; email?: unknown };
  try {
    body = await request.clone().json();
  } catch {
    return NextResponse.json({ error: "Send a valid request." }, { status: 400 });
  }

  // If email is provided, delegate to our Nodemailer email OTP engine
  if (typeof body.email === "string" && body.email.includes("@")) {
    return handleEmailOtpPost(request);
  }

  const phone = normalizePhone(body.phone);
  if (!phone) return NextResponse.json({ error: "Enter a valid mobile number, including the country code." }, { status: 400 });
  if (body.action !== "send" && body.action !== "verify") return NextResponse.json({ error: "Choose send or verify." }, { status: 400 });

  const credentials = twilioCredentials();
  if (!credentials) return NextResponse.json({ error: "SMS verification is temporarily unavailable. Please contact the store for help." }, { status: 503 });

  if (body.action === "send") {
    try {
      const result = await twilioRequest("Verifications", { To: phone, Channel: "sms" });
      if (!result?.ok) return NextResponse.json({ error: "The SMS provider could not send a code to this number. Check the number and provider account." }, { status: 502 });
      return NextResponse.json({ ok: true, mode: "twilio", message: "A verification code was sent by SMS." });
    } catch {
      return NextResponse.json({ error: "The SMS provider is temporarily unreachable. Try again shortly." }, { status: 502 });
    }
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "Enter the 6-digit verification code from the SMS." }, { status: 400 });
  try {
    const result = await twilioRequest("VerificationCheck", { To: phone, Code: code });
    if (!result?.ok || result.status !== "approved") return NextResponse.json({ error: "That code is incorrect, expired, or already used." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "The SMS provider is temporarily unreachable. Try again shortly." }, { status: 502 });
  }

  try {
    const response = NextResponse.json({ ok: true, phone, message: "Mobile number verified." });
    setSessionCookie(response, phone);
    return response;
  } catch {
    return NextResponse.json({ error: "Add a server session secret before enabling phone sign-in." }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  const session = readPhoneSession(request);
  return NextResponse.json(session ? { authenticated: true, phone: session.phone } : { authenticated: false }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieName, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
