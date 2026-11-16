import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hashPhoneOtp } from "@/lib/phone-otp";
import { setCustomerSessionCookie } from "@/lib/customer-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getClients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
    const body = await request.json() as { verificationId?: unknown; code?: unknown };
    const verificationId = typeof body.verificationId === "string" ? body.verificationId : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(verificationId) || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "A valid verification request and 6-digit code are required." }, { status: 400 });
    }

    const { admin, publicClient } = getClients();
    const { data: verification, error: lookupError } = await admin.from("phone_verifications")
      .select("id,phone_e164,full_name,otp_hash,salt,status,attempts,expires_at")
      .eq("id", verificationId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!verification || verification.status !== "pending") return NextResponse.json({ error: "This verification code is no longer active." }, { status: 400 });
    if (Date.parse(verification.expires_at) <= Date.now()) {
      const { error } = await admin.from("phone_verifications").update({ status: "expired" }).eq("id", verificationId);
      if (error) throw error;
      return NextResponse.json({ error: "This verification code has expired. Request a new one." }, { status: 400 });
    }
    if (verification.attempts >= 5) return NextResponse.json({ error: "Too many incorrect attempts. Request a new code." }, { status: 429 });

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
      return NextResponse.json({ error: attempts >= 5 ? "Too many incorrect attempts. Request a new code." : "That code is incorrect." }, { status: attempts >= 5 ? 429 : 400 });
    }

    const { data: claimed, error: claimError } = await admin.from("phone_verifications")
      .update({ status: "verified", attempts: verification.attempts + 1 })
      .eq("id", verificationId).eq("status", "pending").select("id").maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return NextResponse.json({ error: "This verification code has already been used." }, { status: 409 });

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
    if (customerUpsertError) throw customerUpsertError;

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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not verify the mobile number." }, { status: 500 });
  }
}
