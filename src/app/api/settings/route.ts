import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSettings, upsertSupabaseSettings, assertSupabaseConfigured } from "@/lib/supabase-server";
import { supabaseErrorResponse } from "@/lib/api-errors";
import type { StoreSettings } from "@/lib/store-db";
import { hasAdminSession, requireAdminRequest } from "@/lib/admin-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redactPrivateSettings(settings: StoreSettings): StoreSettings {
  return {
    ...settings,
    account: {
      ...settings.account,
      adminEmails: [],
      notificationEmails: [],
      twoFactorEnabled: false,
      pinCode: "",
    },
  };
}

export async function GET(request: NextRequest) {
  const isAdmin = await hasAdminSession(request);
  try {
    assertSupabaseConfigured();
    const settings = await getSupabaseSettings();
    if (!settings) {
      return NextResponse.json({ success: false, error: "Store settings are not initialized in Supabase." }, { status: 503 });
    }
    const responseSettings = isAdmin ? settings : redactPrivateSettings(settings);
    return NextResponse.json(
      { success: true, settings: responseSettings },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("Failed to load settings:", error);
    return supabaseErrorResponse(error, "Failed to load store settings");
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireAdminRequest(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid settings payload" },
        { status: 400 }
      );
    }

    assertSupabaseConfigured();
    const current = await getSupabaseSettings();
    if (!current) return NextResponse.json({ success: false, error: "Store settings are not initialized." }, { status: 503 });
    const updated = {
      ...current,
      restaurant: { ...current.restaurant, ...(body.restaurant || {}) },
      delivery: { ...current.delivery, ...(body.delivery || {}) },
      payments: { ...current.payments, ...(body.payments || {}) },
      businessHours: { ...current.businessHours, ...(body.businessHours || {}) },
      social: { ...current.social, ...(body.social || {}) },
      account: { ...current.account, ...(body.account || {}) },
    };
    await upsertSupabaseSettings(updated);
    return NextResponse.json({
      success: true,
      message: "Store settings saved and synchronized successfully",
      settings: updated,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("Failed to save settings:", error);
    return supabaseErrorResponse(error, "Failed to persist store settings");
  }
}
