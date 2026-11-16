import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";

export const CUSTOMER_SESSION_COOKIE = "hmf_customer_session";
export const CUSTOMER_OTP_COOKIE = "hmf_customer_otp";
export const OAUTH_STATE_COOKIE = "hmf_oauth_state";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const DEFAULT_AUTH_SECRET =
  "hmf_stable_auth_secret_session_key_2026_vercel_production_safety_32_chars";

export function getSessionSecret(): string {
  const envSecret = process.env.HMF_AUTH_SESSION_SECRET || process.env.HMF_ADMIN_SESSION_SECRET;
  if (envSecret && envSecret.length >= 32) return envSecret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("HMF_AUTH_SESSION_SECRET must contain at least 32 characters in production.");
  }
  return DEFAULT_AUTH_SECRET;
}

export type CustomerSessionPayload = {
  customerId: string;
  email?: string;
  phone?: string;
  name: string;
  verified: boolean;
  avatarUrl?: string;
  authProvider?: "google" | "email" | "phone";
  phoneVerified?: boolean;
  exp: number;
};

export function createSignedCustomerSession(payload: object): string {
  const secret = getSessionSecret();
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}

export function verifySignedCustomerSession<T = CustomerSessionPayload>(token: string | undefined): T | null {
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
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as T;
    return parsed;
  } catch {
    return null;
  }
}

export function setCustomerSessionCookie(
  response: NextResponse,
  payload: Omit<CustomerSessionPayload, "exp">
): string {
  const fullPayload: CustomerSessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const token = createSignedCustomerSession(fullPayload);
  response.cookies.set(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return token;
}

export function clearCustomerSessionCookie(response: NextResponse) {
  response.cookies.set(CUSTOMER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
