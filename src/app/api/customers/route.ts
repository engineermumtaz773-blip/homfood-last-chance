import { NextRequest, NextResponse } from "next/server";
import { getSupabaseCustomers, upsertSupabaseCustomer, upsertSupabasePhoneCustomer, deleteSupabaseCustomer, insertSupabaseNotification, assertSupabaseConfigured } from "@/lib/supabase-server";
import { supabaseErrorResponse } from "@/lib/api-errors";
import { requireAdminRequest } from "@/lib/admin-request";
import { CUSTOMER_SESSION_COOKIE, verifySignedCustomerSession } from "@/lib/customer-session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authError = await requireAdminRequest(request);
  if (authError) return authError;

  try {
    assertSupabaseConfigured();
    const customers = await getSupabaseCustomers();
    return NextResponse.json({
      ok: true,
      customers,
      total: customers.length,
      verifiedCount: customers.filter((c) => c.emailVerified).length,
    });
  } catch (error) {
    console.error("[GET_CUSTOMERS_ERROR]", error);
    return supabaseErrorResponse(error, "Failed to fetch customers");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      id?: string;
      name: string;
      email?: string;
      phone?: string;
      avatarUrl?: string;
      authProvider?: "google" | "email" | "phone";
      emailVerified?: boolean;
      addresses?: string[];
      notes?: string;
    };

    const adminError = await requireAdminRequest(request);
    const customerSession = verifySignedCustomerSession(request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value);
    const activeCustomerSession = customerSession && customerSession.verified === true &&
      typeof customerSession.exp === "number" && customerSession.exp > Math.floor(Date.now() / 1000);
    const customerCanUpdateEmail = activeCustomerSession &&
      typeof customerSession.email === "string" &&
      typeof body.email === "string" &&
      customerSession.email.toLowerCase() === body.email.trim().toLowerCase();
    const customerCanUpdatePhone = activeCustomerSession &&
      customerSession.phoneVerified === true &&
      typeof customerSession.phone === "string" &&
      typeof body.phone === "string" &&
      customerSession.phone === body.phone &&
      (!body.id || body.id === customerSession.customerId);
    const customerCanUpdate = customerCanUpdateEmail || customerCanUpdatePhone;
    if (adminError && !customerCanUpdate) return adminError;
    if (!body.email?.includes("@") && !customerCanUpdatePhone) {
      return NextResponse.json({ error: "A valid email or verified phone session is required." }, { status: 400 });
    }

    assertSupabaseConfigured();
    const name = body.name || "Customer";
    const saved = customerCanUpdatePhone
      ? await upsertSupabasePhoneCustomer({
          id: customerSession!.customerId,
          name,
          phone: customerSession!.phone!,
          avatarUrl: body.avatarUrl,
          addresses: body.addresses,
          notes: body.notes,
        })
      : await upsertSupabaseCustomer({
          id: body.id,
          name,
          email: body.email!,
          phone: body.phone,
          avatarUrl: body.avatarUrl,
          authProvider: body.authProvider || "email",
          emailVerified: body.emailVerified !== undefined ? body.emailVerified : true,
          addresses: body.addresses,
          notes: body.notes,
        });
    await insertSupabaseNotification({
      type: "profile_updated",
      title: "Customer profile updated",
      body: `${name} updated their profile.`,
      priority: "normal",
    });

    return NextResponse.json({ ok: true, customer: saved });
  } catch (error) {
    console.error("[UPSERT_CUSTOMER_ERROR]", error);
    return supabaseErrorResponse(error, "Failed to save customer");
  }
}

export async function DELETE(request: NextRequest) {
  const authError = await requireAdminRequest(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Customer ID is required" }, { status: 400 });
    }

    assertSupabaseConfigured();
    const removed = await deleteSupabaseCustomer(id);
    if (!removed) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, message: "Customer removed successfully" });
  } catch (error) {
    console.error("[DELETE_CUSTOMER_ERROR]", error);
    return supabaseErrorResponse(error, "Failed to delete customer");
  }
}
