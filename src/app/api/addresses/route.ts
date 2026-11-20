import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, createSupabaseAddress, deleteSupabaseAddress, getSupabaseAddresses, getSupabaseProfileIdForCustomer } from "@/lib/supabase-server";
import { CUSTOMER_SESSION_COOKIE, verifySignedCustomerSession } from "@/lib/customer-session";
import { supabaseErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function getUserId(request: NextRequest) {
  const session = verifySignedCustomerSession(request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value);
  if (!session?.verified || session.exp <= Math.floor(Date.now() / 1000) || !uuidPattern.test(session.customerId)) return null;
  return session.customerId;
}

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Sign in with a verified account to load saved addresses." }, { status: 401 });
  try {
    assertSupabaseConfigured();
    const profileId = await getSupabaseProfileIdForCustomer(userId);
    if (!profileId) return NextResponse.json({ error: "Customer profile was not found." }, { status: 404 });
    return NextResponse.json({ addresses: await getSupabaseAddresses(profileId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[GET_ADDRESSES_ERROR]", error);
    return supabaseErrorResponse(error, "Saved addresses could not be loaded.");
  }
}

export async function POST(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Sign in with a verified account to save addresses." }, { status: 401 });
  try {
    const body = await request.json() as { label?: unknown; line1?: unknown; city?: unknown; zone?: unknown; isDefault?: unknown };
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const line1 = typeof body.line1 === "string" ? body.line1.trim() : "";
    const city = typeof body.city === "string" ? body.city.trim() : "";
    const zone = typeof body.zone === "string" ? body.zone.trim() : "";
    if (label.length < 1 || label.length > 60 || line1.length < 3 || line1.length > 300 ||
      city.length < 2 || city.length > 80 || zone.length < 2 || zone.length > 100 ||
      (body.isDefault !== undefined && typeof body.isDefault !== "boolean")) {
      return NextResponse.json({ error: "Provide a valid label, street address, city, and delivery zone." }, { status: 400 });
    }
    assertSupabaseConfigured();
    const profileId = await getSupabaseProfileIdForCustomer(userId);
    if (!profileId) return NextResponse.json({ error: "Customer profile was not found." }, { status: 404 });
    const address = await createSupabaseAddress({ userId: profileId, label, line1, city, zone, isDefault: body.isDefault === true });
    return NextResponse.json({ address }, { status: 201 });
  } catch (error) {
    console.error("[CREATE_ADDRESS_ERROR]", error);
    return supabaseErrorResponse(error, "Saved address could not be created.");
  }
}

export async function DELETE(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Sign in with a verified account to remove addresses." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id")?.trim() || "";
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "A valid address ID is required." }, { status: 400 });
  try {
    assertSupabaseConfigured();
    const profileId = await getSupabaseProfileIdForCustomer(userId);
    if (!profileId) return NextResponse.json({ error: "Customer profile was not found." }, { status: 404 });
    await deleteSupabaseAddress(profileId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE_ADDRESS_ERROR]", error);
    return supabaseErrorResponse(error, "Saved address could not be removed.");
  }
}
