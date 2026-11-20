import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, updateSupabaseCustomerSubscription } from "@/lib/supabase-server";
import { CUSTOMER_SESSION_COOKIE, verifySignedCustomerSession } from "@/lib/customer-session";
import { supabaseErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function PATCH(request: NextRequest) {
  const session = verifySignedCustomerSession(request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value);
  if (!session?.verified || session.exp <= Math.floor(Date.now() / 1000) || !session.customerId) {
    return NextResponse.json({ error: "Sign in with a verified account to manage meal plans." }, { status: 401 });
  }
  try {
    const body = await request.json() as { id?: unknown; status?: unknown };
    if (typeof body.id !== "string" || !uuidPattern.test(body.id) ||
      !["active", "paused", "cancelled"].includes(String(body.status))) {
      return NextResponse.json({ error: "Choose a valid meal plan and status." }, { status: 400 });
    }
    assertSupabaseConfigured();
    const subscription = await updateSupabaseCustomerSubscription(
      body.id,
      session.customerId,
      body.status as "active" | "paused" | "cancelled",
    );
    if (!subscription) return NextResponse.json({ error: "Meal plan not found for this customer." }, { status: 404 });
    return NextResponse.json({ subscription });
  } catch (error) {
    console.error("[MANAGE_CUSTOMER_SUBSCRIPTION_ERROR]", error);
    return supabaseErrorResponse(error, "Meal plan could not be updated.");
  }
}
