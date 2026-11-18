import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hashPhoneOtp } from "@/lib/phone-otp";
import { setCustomerSessionCookie } from "@/lib/customer-session";
import { isSupabaseSchemaMismatch } from "@/lib/supabase-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getClients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !serviceKey || !anonKey) {
    throw new Error("Phone sign-in requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return {
    admin: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    publicClient: createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

export async function POST(request: NextRequest) {
  try {
    let requestBody: unknown;
    try {
      requestBody = await request.json();
    } catch {
      return failure("Send a valid JSON request.", 400);
    }
    if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) {
      return failure("Send a valid JSON request.", 400);
    }
    const body = requestBody as { verificationId?: unknown; code?: unknown };
    const verificationId = typeof body.verificationId === "string" ? body.verificationId : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(verificationId) || !/^\d{6}$/.test(code)) {
      return failure("A valid verification request and 6-digit code are required.", 400);
    }

    const { admin, publicClient } = getClients();
    const { data: verification, error: lookupError } = await admin.from("phone_verifications")
      .select("id,phone_e164,full_name,otp_hash,salt,status,attempts,expires_at")
      .eq("id", verificationId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!verification || verification.status !== "pending") return failure("This verification code is no longer active.", 400);
    if (Date.parse(verification.expires_at) <= Date.now()) {
      const { error } = await admin.from("phone_verifications").update({ status: "expired" }).eq("id", verificationId);
      if (error) throw error;
      return failure("This verification code has expired. Request a new one.", 400);
    }
    if (verification.attempts >= 5) return failure("Too many incorrect attempts. Request a new code.", 429);

    const candidate = Buffer.from(hashPhoneOtp(code, verification.salt), "hex");
    const expected = Buffer.from(verification.otp_hash, "hex");
    const valid = candidate.length === expected.length && timingSafeEqual(candidate, expected);
    if (!valid) {
      const attempts = verification.attempts + 1;
      const { error } = await admin.from("phone_verifications").update({
        attempts,
        ...(attempts >= 5 ? { status: "expired" } : {}),
      }).eq("id", verificationId).eq("status", "pending");
      if (error) throw error;
      return failure(attempts >= 5 ? "Too many incorrect attempts. Request a new code." : "That code is incorrect.", attempts >= 5 ? 429 : 400);
    }

    const { data: claimed, error: claimError } = await admin.from("phone_verifications")
      .update({ status: "verified", attempts: verification.attempts + 1 })
      .eq("id", verificationId).eq("status", "pending").select("id").maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return failure("This verification code has already been used.", 409);

    const temporaryPassword = randomBytes(48).toString("base64url");
    const { data: profile, error: profileLookupError } = await admin.from("profiles")
      .select("id").eq("phone", verification.phone_e164).maybeSingle();
    if (profileLookupError) throw profileLookupError;

    let userId: string;
    if (profile?.id) {
      const { data, error } = await admin.auth.admin.updateUserById(profile.id, {
        phone: verification.phone_e164,
        phone_confirm: true,
        password: temporaryPassword,
        user_metadata: { full_name: verification.full_name },
      });
      if (error) throw error;
      userId = data.user.id;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        phone: verification.phone_e164,
        phone_confirm: true,
        password: temporaryPassword,
        user_metadata: { full_name: verification.full_name },
      });
      if (error) throw error;
      userId = data.user.id;
    }

    const { error: profileUpsertError } = await admin.from("profiles").upsert({
      id: userId,
      full_name: verification.full_name,
      phone: verification.phone_e164,
      phone_verified: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (profileUpsertError) throw profileUpsertError;
    const { error: customerUpsertError } = await admin.from("customers").upsert({
      id: userId,
      auth_user_id: userId,
      name: verification.full_name,
      email: null,
      phone: verification.phone_e164,
      auth_provider: "phone",
      email_verified: false,
      updated_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (customerUpsertError) {
      if (isSupabaseSchemaMismatch(customerUpsertError)) {
        console.error("[PHONE_OTP_CUSTOMER_SCHEMA_FALLBACK]", customerUpsertError);
      } else {
        throw customerUpsertError;
      }
    }

    const { data: authData, error: signInError } = await publicClient.auth.signInWithPassword({
      phone: verification.phone_e164,
      password: temporaryPassword,
    });
    if (signInError || !authData.session) throw signInError || new Error("Supabase did not issue an authenticated session.");

    const response = NextResponse.json({
      ok: true,
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
      },
      customer: {
        id: userId,
        name: verification.full_name,
        phone: verification.phone_e164,
        authProvider: "phone",
        emailVerified: false,
        phoneVerified: true,
        addresses: [],
        preferredPayment: "Digital Payment (Raast)",
      },
    }, { headers: { "Cache-Control": "no-store" } });
    setCustomerSessionCookie(response, {
      customerId: userId,
      phone: verification.phone_e164,
      name: verification.full_name,
      verified: true,
      authProvider: "phone",
      phoneVerified: true,
    });
    return response;
  } catch (error) {
    console.error("[PHONE_OTP_VERIFY_ERROR]", error);
    if (isSupabaseSchemaMismatch(error)) {
      return failure("Phone verification is temporarily unavailable because the database setup is incomplete. Please contact support.", 503);
    }
    return failure("Could not verify the mobile number. Please check the code or try again.", 500);
  }
}
