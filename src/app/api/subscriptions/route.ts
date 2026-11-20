import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, createSupabaseSubscription, getSupabaseCustomerSubscriptions, getSupabaseSubscriptions, updateSupabaseSubscription } from "@/lib/supabase-server";
import { CUSTOMER_SESSION_COOKIE, verifySignedCustomerSession } from "@/lib/customer-session";
import { supabaseErrorResponse } from "@/lib/api-errors";
import { requireAdminRequest } from "@/lib/admin-request";

export const runtime = "nodejs";

function getCustomer(request: NextRequest) {
  const customer = verifySignedCustomerSession(request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value);
  return customer?.verified === true && customer.exp > Math.floor(Date.now() / 1000) ? customer : null;
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminRequest(request);
  try {
    assertSupabaseConfigured();
    if (!adminError) {
      return NextResponse.json({ subscriptions: await getSupabaseSubscriptions() }, { headers: { "Cache-Control": "no-store" } });
    }
    const customer = getCustomer(request);
    if (!customer) return NextResponse.json({ error: "Verified customer authentication is required." }, { status: 401 });
    const subscriptions = await getSupabaseCustomerSubscriptions(customer.customerId);
    return NextResponse.json({ subscriptions }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[GET_SUBSCRIPTIONS_ERROR]", error);
    return supabaseErrorResponse(error, "Could not load meal subscriptions.");
  }
}

export async function PATCH(request: NextRequest) {
  const authError = await requireAdminRequest(request);
  if (authError) return authError;
  try {
    const body = await request.json() as { id?: unknown; status?: unknown };
    if (typeof body.id !== "string" || !["active", "paused", "cancelled", "completed"].includes(String(body.status))) {
      return NextResponse.json({ error: "A subscription ID and valid status are required." }, { status: 400 });
    }
    assertSupabaseConfigured();
    const subscription = await updateSupabaseSubscription(body.id, body.status as "active" | "paused" | "cancelled" | "completed");
    if (!subscription) return NextResponse.json({ error: "Meal plan not found." }, { status: 404 });
    return NextResponse.json({ subscription });
  } catch (error) {
    console.error("[UPDATE_SUBSCRIPTION_ERROR]", error);
    return supabaseErrorResponse(error, "Could not update the meal plan.");
  }
}

export async function POST(request: NextRequest) {
  const customer = getCustomer(request);
  if (!customer) return NextResponse.json({ error: "Sign in with a verified account to start a meal plan." }, { status: 401 });
  try {
    const body = await request.json() as {
      planType?: unknown;
      daysOfWeek?: unknown;
      mealSlot?: unknown;
      startDate?: unknown;
      endDate?: unknown;
    };
    const validDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    if ((body.planType !== "weekly" && body.planType !== "monthly") ||
      !Array.isArray(body.daysOfWeek) || body.daysOfWeek.length < 1 ||
      body.daysOfWeek.some((day) => typeof day !== "string" || !validDays.includes(day)) ||
      (body.mealSlot !== "lunch" && body.mealSlot !== "dinner") ||
      typeof body.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate) ||
      (body.endDate !== undefined && (typeof body.endDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate)))) {
      return NextResponse.json({ error: "Choose a plan, meal, at least one valid weekday, and valid dates." }, { status: 400 });
    }
    if (body.endDate && body.endDate < body.startDate) {
      return NextResponse.json({ error: "The plan end date must be on or after its start date." }, { status: 400 });
    }
    assertSupabaseConfigured();
    const subscription = await createSupabaseSubscription({
      customerId: customer.customerId,
      planType: body.planType,
      daysOfWeek: [...new Set(body.daysOfWeek as string[])],
      mealSlot: body.mealSlot,
      startDate: body.startDate,
      endDate: body.endDate as string | undefined,
    });
    return NextResponse.json({ subscription }, { status: 201 });
  } catch (error) {
    console.error("[CREATE_SUBSCRIPTION_ERROR]", error);
    return supabaseErrorResponse(error, "Could not start this meal plan.");
  }
}
