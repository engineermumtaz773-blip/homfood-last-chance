import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, getSupabaseCustomerFavorites, updateSupabaseCustomerFavorites } from "@/lib/supabase-server";
import { CUSTOMER_SESSION_COOKIE, verifySignedCustomerSession } from "@/lib/customer-session";
import { supabaseErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

function getCustomer(request: NextRequest) {
  const customer = verifySignedCustomerSession(request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value);
  if (!customer || customer.verified !== true || customer.exp <= Math.floor(Date.now() / 1000)) return null;
  return customer;
}

export async function GET(request: NextRequest) {
  const customer = getCustomer(request);
  if (!customer) return NextResponse.json({ error: "Customer authentication required." }, { status: 401 });
  try {
    assertSupabaseConfigured();
    const ids = await getSupabaseCustomerFavorites(customer.customerId);
    if (!ids) return NextResponse.json({ error: "Customer profile was not found." }, { status: 404 });
    return NextResponse.json({ favoriteDishIds: ids }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[GET_CUSTOMER_FAVORITES_ERROR]", error);
    return supabaseErrorResponse(error, "Could not load saved favorites.");
  }
}

export async function PUT(request: NextRequest) {
  const customer = getCustomer(request);
  if (!customer) return NextResponse.json({ error: "Customer authentication required." }, { status: 401 });
  try {
    const body = await request.json() as { favoriteDishIds?: unknown };
    if (!Array.isArray(body.favoriteDishIds) || body.favoriteDishIds.length > 100 ||
      body.favoriteDishIds.some((id) => typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0)) {
      return NextResponse.json({ error: "Favorite dish IDs must be a list of up to 100 positive integers." }, { status: 400 });
    }
    assertSupabaseConfigured();
    const ids = await updateSupabaseCustomerFavorites(customer.customerId, body.favoriteDishIds as number[]);
    if (!ids) return NextResponse.json({ error: "Customer profile was not found." }, { status: 404 });
    return NextResponse.json({ favoriteDishIds: ids }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[UPDATE_CUSTOMER_FAVORITES_ERROR]", error);
    return supabaseErrorResponse(error, "Could not save favorites.");
  }
}
