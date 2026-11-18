import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, createSupabaseReservation, getSupabaseReservations, updateSupabaseReservation } from "@/lib/supabase-server";
import { requireAdminRequest } from "@/lib/admin-request";
import { CUSTOMER_SESSION_COOKIE, verifySignedCustomerSession } from "@/lib/customer-session";
import { supabaseErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authError = await requireAdminRequest(request);
  if (authError) return authError;
  try {
    assertSupabaseConfigured();
    return NextResponse.json({ reservations: await getSupabaseReservations() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[GET_RESERVATIONS_ERROR]", error);
    return supabaseErrorResponse(error, "Could not load reservations.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { name?: unknown; phone?: unknown; partySize?: unknown; slotTime?: unknown; notes?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const slot = typeof body.slotTime === "string" ? Date.parse(body.slotTime) : NaN;
    const partySize = Number(body.partySize);
    if (name.length < 2 || name.length > 120 || !/^[+\d() -]{10,20}$/.test(phone) ||
      !Number.isInteger(partySize) || partySize < 1 || partySize > 30 ||
      !Number.isFinite(slot) || slot <= Date.now() ||
      (typeof body.notes === "string" && body.notes.length > 500)) {
      return NextResponse.json({ error: "Enter a valid name, phone, future time, party size (1–30), and notes under 500 characters." }, { status: 400 });
    }
    const session = verifySignedCustomerSession(request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value);
    const customerId = session?.verified && session.exp > Math.floor(Date.now() / 1000) ? session.customerId : undefined;
    assertSupabaseConfigured();
    const reservation = await createSupabaseReservation({
      customerId,
      guestName: name,
      phone,
      partySize,
      slotTime: new Date(slot).toISOString(),
      notes: typeof body.notes === "string" ? body.notes.trim() : "",
    });
    return NextResponse.json({ reservation }, { status: 201 });
  } catch (error) {
    console.error("[CREATE_RESERVATION_ERROR]", error);
    return supabaseErrorResponse(error, "Could not submit the reservation.");
  }
}

export async function PATCH(request: NextRequest) {
  const authError = await requireAdminRequest(request);
  if (authError) return authError;
  try {
    const body = await request.json() as { id?: unknown; status?: unknown };
    if (typeof body.id !== "string" || !["confirmed", "cancelled", "completed"].includes(String(body.status))) {
      return NextResponse.json({ error: "A reservation ID and valid status are required." }, { status: 400 });
    }
    assertSupabaseConfigured();
    const reservation = await updateSupabaseReservation(body.id, body.status as "confirmed" | "cancelled" | "completed");
    if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    return NextResponse.json({ reservation });
  } catch (error) {
    console.error("[UPDATE_RESERVATION_ERROR]", error);
    return supabaseErrorResponse(error, "Could not update the reservation.");
  }
}
