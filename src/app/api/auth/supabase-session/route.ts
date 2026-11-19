import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, upsertSupabaseAuthProfile, upsertSupabaseCustomer } from "@/lib/supabase-server";
import { setCustomerSessionCookie } from "@/lib/customer-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SupabaseUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

export async function POST(request: NextRequest) {
  try {
    const { accessToken } = await request.json() as { accessToken?: string };
    if (typeof accessToken !== "string" || accessToken.length < 20 || accessToken.length > 10_000) {
      return NextResponse.json({ error: "A valid sign-in session is required." }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ error: "Supabase sign-in is not configured." }, { status: 503 });
    }

    const userResponse = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!userResponse.ok) {
      return NextResponse.json({ error: "The sign-in session could not be verified. Please try again." }, { status: 401 });
    }
    const user = await userResponse.json() as SupabaseUser;
    const email = user.email?.trim().toLowerCase();
    if (!user.id || !email || !user.email_confirmed_at) {
      return NextResponse.json({ error: "A verified email address is required to sign in." }, { status: 403 });
    }

    assertSupabaseConfigured();
    const metadata = user.user_metadata || {};
    const provider = user.app_metadata?.provider === "google" ? "google" : "email";
    const name = [metadata.full_name, metadata.name, metadata.display_name]
      .find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim()
      || email.split("@")[0];
    const avatarUrl = [metadata.avatar_url, metadata.picture]
      .find((value): value is string => typeof value === "string" && /^https:\/\//i.test(value)) || "";
    await upsertSupabaseAuthProfile({
      id: user.id,
      email,
      name,
      avatarUrl,
      metadata,
    });
    const customer = await upsertSupabaseCustomer({
      email,
      name,
      avatarUrl,
      authProvider: provider,
      emailVerified: true,
    });
    const response = NextResponse.json({ ok: true, customer });
    setCustomerSessionCookie(response, {
      customerId: customer.id,
      email: customer.email,
      name: customer.name,
      verified: true,
      avatarUrl: customer.avatarUrl,
      authProvider: provider,
    });
    return response;
  } catch (error) {
    console.error("[SUPABASE_CUSTOMER_SESSION_ERROR]", error);
    return NextResponse.json({ error: "Unable to finish sign-in right now. Please try again." }, { status: 503 });
  }
}
