import { NextRequest, NextResponse } from "next/server";
import { randomInt, createHmac, timingSafeEqual } from "node:crypto";
import { sendCustomerOtpEmail } from "@/lib/customer-otp-email";
import { assertSupabaseConfigured, upsertSupabaseCustomer, getSupabaseCustomers, getSupabaseCustomerByEmail, supabaseAuthUserExists } from "@/lib/supabase-server";
import { getSessionSecret as getCustomerSessionSecret } from "@/lib/customer-session";

export const runtime = "nodejs";

const CUSTOMER_SESSION_COOKIE = "hmf_customer_session";
const CUSTOMER_OTP_COOKIE = "hmf_customer_otp";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const OTP_EXPIRY_SECONDS = 10 * 60; // Exactly 10 minutes

type PendingOtp = {
  code: string;
  email: string;
  name?: string;
  phone?: string;
  avatarUrl?: string;
  authProvider: "google" | "email";
  purpose: "signup" | "login" | "reset";
  expiresAt: number;
  attempts: number;
};

// Global singleton for local in-memory fallback
const globalOtps = globalThis as unknown as { __hmf_customer_otps?: Map<string, PendingOtp> };
if (!globalOtps.__hmf_customer_otps) {
  globalOtps.__hmf_customer_otps = new Map<string, PendingOtp>();
}
const pendingOtpStore = globalOtps.__hmf_customer_otps;

function getSessionSecret(): string {
  return getCustomerSessionSecret();
}

function createSignedSession(payload: object): string {
  const secret = getSessionSecret();
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}

function verifySignedSession<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [data, signature, extra] = token.split(".");
  if (!data || !signature || extra) return null;
  const secret = getSessionSecret();
  const expected = createHmac("sha256", secret).update(data).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    return JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

type OtpCookiePayload = {
  email: string;
  codeHash: string;
  name?: string;
  phone?: string;
  avatarUrl?: string;
  authProvider: "google" | "email";
  purpose: "signup" | "login" | "reset";
  expiresAt: number;
  attempts: number;
};

function hashOtpCode(code: string, email: string): string {
  const secret = getSessionSecret();
  return createHmac("sha256", secret).update(`${email}:${code}`).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    assertSupabaseConfigured();
    const body = await request.json() as {
      action?: "send" | "verify" | "resend";
      email?: string;
      code?: string;
      name?: string;
      phone?: string;
      avatarUrl?: string;
      authProvider?: "google" | "email";
      purpose?: "signup" | "login" | "reset";
      mode?: "signup" | "login" | "reset";
    };

    const action = body.action || "send";
    const email = body.email?.trim().toLowerCase();
    const purpose = body.purpose || body.mode || "login";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    if (action === "send" || action === "resend") {
      // 1. If mode is "signup", check if account already exists
      const existingCustomer = await getSupabaseCustomerByEmail(email);
      const authUserExists = purpose === "signup" ? await supabaseAuthUserExists(email) : false;
      if (purpose === "signup" && ((existingCustomer && existingCustomer.emailVerified) || authUserExists)) {
        return NextResponse.json(
          {
            ok: false,
            accountExists: true,
            error: "An account with this email already exists.",
            message: "Existing (Sign In): this email is already registered. Request a sign-in OTP to continue.",
            email,
          },
          { status: 409 }
        );
      }

      // 2. Generate secure 6-digit OTP code & 10 minute expiration
      const code = String(randomInt(100000, 999999));
      const expiresAt = Date.now() + OTP_EXPIRY_SECONDS * 1000;
      const codeHash = hashOtpCode(code, email);

      const otpPayload: OtpCookiePayload = {
        email,
        codeHash,
        name: body.name?.trim() || existingCustomer?.name,
        phone: body.phone?.trim() || existingCustomer?.phone,
        avatarUrl: body.avatarUrl?.trim() || existingCustomer?.avatarUrl,
        authProvider: body.authProvider || (existingCustomer?.authProvider as "google" | "email") || "email",
        purpose,
        expiresAt,
        attempts: 0,
      };

      // In-memory backup
      pendingOtpStore.set(email, {
        code,
        email,
        name: otpPayload.name,
        phone: otpPayload.phone,
        avatarUrl: otpPayload.avatarUrl,
        authProvider: otpPayload.authProvider,
        purpose,
        expiresAt,
        attempts: 0,
      });

      // Send email
      const emailResult = await sendCustomerOtpEmail(email, code, otpPayload.name);

      const response = NextResponse.json({
        ok: true,
        message: `A 6-digit verification code has been sent to ${email}.`,
        email,
        expiresInSeconds: OTP_EXPIRY_SECONDS,
        expiresAt,
        devCode: emailResult.devCode || (process.env.NODE_ENV !== "production" ? code : undefined),
      });

      // Store in signed HTTP-only cookie with exactly 10 min expiration
      const signedOtpCookie = createSignedSession(otpPayload);
      response.cookies.set(CUSTOMER_OTP_COOKIE, signedOtpCookie, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: OTP_EXPIRY_SECONDS,
      });

      return response;
    }

    if (action === "verify") {
      const code = body.code?.trim().replace(/\D/g, "");
      if (!code || code.length !== 6) {
        return NextResponse.json({ error: "Please enter the full 6-digit verification code." }, { status: 400 });
      }

      // Check signed HTTP-only cookie first (handles Vercel serverless functions across different instances)
      const rawCookie = request.cookies.get(CUSTOMER_OTP_COOKIE)?.value;
      const cookiePayload = verifySignedSession<OtpCookiePayload>(rawCookie);
      const memoryPayload = pendingOtpStore.get(email);

      const payload = (cookiePayload && cookiePayload.email === email)
        ? cookiePayload
        : memoryPayload
        ? {
            email: memoryPayload.email,
            codeHash: hashOtpCode(memoryPayload.code, memoryPayload.email),
            name: memoryPayload.name,
            phone: memoryPayload.phone,
            avatarUrl: memoryPayload.avatarUrl,
            authProvider: memoryPayload.authProvider,
            purpose: memoryPayload.purpose,
            expiresAt: memoryPayload.expiresAt,
            attempts: memoryPayload.attempts,
          }
        : null;

      if (!payload) {
        return NextResponse.json(
          { error: "No active verification code found for this email. Please request a new code." },
          { status: 400 }
        );
      }

      if (Date.now() > payload.expiresAt) {
        pendingOtpStore.delete(email);
        const res = NextResponse.json(
          { error: "Your verification code has expired (valid for 10 minutes). Please request a fresh code." },
          { status: 400 }
        );
        res.cookies.set(CUSTOMER_OTP_COOKIE, "", { path: "/", maxAge: 0 });
        return res;
      }

      if (payload.attempts >= 5) {
        pendingOtpStore.delete(email);
        const res = NextResponse.json(
          { error: "Too many failed attempts. Please request a fresh verification code." },
          { status: 429 }
        );
        res.cookies.set(CUSTOMER_OTP_COOKIE, "", { path: "/", maxAge: 0 });
        return res;
      }

      const candidateHash = hashOtpCode(code, email);
      const expectedBuffer = Buffer.from(payload.codeHash, "hex");
      const actualBuffer = Buffer.from(candidateHash, "hex");

      const match =
        expectedBuffer.length === actualBuffer.length &&
        timingSafeEqual(expectedBuffer, actualBuffer);

      if (!match) {
        payload.attempts += 1;
        if (memoryPayload) memoryPayload.attempts = payload.attempts;

        const res = NextResponse.json(
          { error: `Incorrect verification code. ${5 - payload.attempts} attempts remaining.` },
          { status: 400 }
        );
        // Update cookie with incremented attempt
        const updatedCookie = createSignedSession(payload);
        res.cookies.set(CUSTOMER_OTP_COOKIE, updatedCookie, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: Math.max(1, Math.floor((payload.expiresAt - Date.now()) / 1000)),
        });
        return res;
      }

      // Code matches! Clear OTP state
      pendingOtpStore.delete(email);

      // Upsert into persistent store database (for Admin & User Sync)
      const customer = await upsertSupabaseCustomer({
        email,
        name: body.name?.trim() || payload.name || email.split("@")[0],
        phone: body.phone?.trim() || payload.phone || "",
        avatarUrl: body.avatarUrl?.trim() || payload.avatarUrl || "",
        authProvider: body.authProvider || payload.authProvider || "email",
        emailVerified: true,
      });

      // Issue signed session cookie
      const sessionPayload = {
        customerId: customer.id,
        email: customer.email,
        name: customer.name,
        verified: true,
        exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
      };

      const sessionToken = createSignedSession(sessionPayload);
      const response = NextResponse.json({
        ok: true,
        message: "Email successfully verified! Welcome to Home Made Food.",
        customer,
      });

      // Set customer session cookie
      response.cookies.set(CUSTOMER_SESSION_COOKIE, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE_SECONDS,
      });

      // Clear pending OTP cookie
      response.cookies.set(CUSTOMER_OTP_COOKIE, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });

      return response;
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    console.error("[CUSTOMER_EMAIL_OTP_ERROR]", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while processing verification." },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value;
    if (!sessionToken) {
      return NextResponse.json({ authenticated: false, customer: null });
    }

    const payload = verifySignedSession<{
      customerId: string;
      email?: string;
      phone?: string;
      name: string;
      verified: boolean;
      authProvider?: "google" | "email" | "phone";
      phoneVerified?: boolean;
      exp: number;
    }>(sessionToken);

    if (!payload || payload.exp <= Math.floor(Date.now() / 1000) || !payload.verified || (!payload.email && !payload.phone)) {
      return NextResponse.json({ authenticated: false, customer: null });
    }

    const customer = (await getSupabaseCustomers()).find((candidate) => candidate.id === payload.customerId);
    if (!customer) {
      return NextResponse.json({ authenticated: false, customer: null });
    }

    return NextResponse.json({
      authenticated: true,
      customer: {
        ...customer,
        phoneVerified: payload.phoneVerified || false,
        authProvider: payload.authProvider || customer.authProvider,
      },
    });
  } catch (error) {
    console.error("[CUSTOMER_SESSION_CHECK_ERROR]", error);
    return NextResponse.json({ authenticated: false, customer: null });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true, message: "Logged out successfully." });
  response.cookies.set(CUSTOMER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(CUSTOMER_OTP_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
