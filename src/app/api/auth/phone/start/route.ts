import { randomBytes, randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pakistaniPhoneSchema } from "@/lib/phone";
import { hashPhoneOtp } from "@/lib/phone-otp";
import { getSmsProvider } from "@/lib/sms/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const otpLifetimeMs = 5 * 60 * 1000;
const resendIntervalMs = 60 * 1000;
const hourMs = 60 * 60 * 1000;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase phone verification requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { phone?: unknown; fullName?: unknown };
    const parsedPhone = pakistaniPhoneSchema.safeParse(body.phone);
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    if (!parsedPhone.success) return NextResponse.json({ error: parsedPhone.error.issues[0]?.message || "Enter a valid mobile number." }, { status: 400 });
    if (fullName.length < 2 || fullName.length > 80) return NextResponse.json({ error: "Enter your full name (2 to 80 characters)." }, { status: 400 });

    const supabase = getAdminClient();
    const phone = parsedPhone.data;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown";
    const now = new Date();
    const hourAgo = new Date(now.getTime() - hourMs).toISOString();
    const { data: recentPhoneSends, error: phoneCountError } = await supabase
      .from("phone_verifications").select("created_at").eq("phone_e164", phone).gte("created_at", hourAgo);
    if (phoneCountError) throw phoneCountError;
    if ((recentPhoneSends || []).length >= 3) return NextResponse.json({ error: "Too many codes requested for this number. Try again later." }, { status: 429 });
    const { data: recentIpSends, error: ipCountError } = await supabase
      .from("phone_verifications").select("created_at").eq("ip", ip).gte("created_at", hourAgo);
    if (ipCountError) throw ipCountError;
    if ((recentIpSends || []).length >= 10) return NextResponse.json({ error: "Too many verification requests from this network. Try again later." }, { status: 429 });
    const mostRecent = (recentPhoneSends || [])
      .map((row) => Date.parse(row.created_at))
      .sort((a, b) => b - a)[0];
    if (mostRecent && now.getTime() - mostRecent < resendIntervalMs) {
      return NextResponse.json({ error: "Please wait before requesting another code." }, { status: 429 });
    }
    const { data: existingPhone, error: phoneLookupError } = await supabase
      .from("profiles").select("id").eq("phone", phone).eq("phone_verified", true).maybeSingle();
    if (phoneLookupError) throw phoneLookupError;
    if (existingPhone) return NextResponse.json({ error: "This mobile number is already registered. Sign in with email or Google." }, { status: 409 });

    const otp = String(randomInt(100000, 1_000_000));
    const salt = randomBytes(16).toString("hex");
    const expiresAt = new Date(now.getTime() + otpLifetimeMs).toISOString();
    const { data: verification, error: insertError } = await supabase
      .from("phone_verifications")
      .insert({
        phone_e164: phone,
        full_name: fullName,
        otp_hash: hashPhoneOtp(otp, salt),
        salt,
        status: "pending",
        expires_at: expiresAt,
        ip,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    try {
      const provider = await getSmsProvider();
      await provider.send({ recipient: phone, message: `Your Home Made Food verification code is ${otp}. It expires in 5 minutes.` });
    } catch (error) {
      const { error: expireError } = await supabase.from("phone_verifications").update({ status: "expired" }).eq("id", verification.id);
      if (expireError) console.error("[PHONE_OTP_EXPIRE_AFTER_SEND_FAILURE]", expireError);
      throw error;
    }

    return NextResponse.json({
      verificationId: verification.id,
      expiresAt,
      resendAfter: new Date(now.getTime() + resendIntervalMs).toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[PHONE_OTP_START_ERROR]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send verification code." }, { status: 500 });
  }
}
