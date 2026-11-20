import { NextRequest, NextResponse } from "next/server";
import {
  type DbOrderStatus,
  type DbOrderItem,
} from "@/lib/store-db";
import { getKitchenAvailability } from "@/lib/kitchen-hours";
import { assertSupabaseConfigured, deleteSupabaseOrder, getSupabaseOrder, getSupabaseOrders, getSupabaseOrdersForPhone, getSupabaseSettings, insertSupabaseNotification, insertSupabaseOrder, updateSupabaseOrder, upsertSupabaseCustomer } from "@/lib/supabase-server";
import { cookies } from "next/headers";
import { readAdminSession } from "@/lib/admin-session";
import { supabaseErrorResponse } from "@/lib/api-errors";
import { requireAdminRequest } from "@/lib/admin-request";
import { CUSTOMER_SESSION_COOKIE, verifySignedCustomerSession, type CustomerSessionPayload } from "@/lib/customer-session";
import { isSupabaseSchemaMismatch } from "@/lib/supabase-schema";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    assertSupabaseConfigured();
    const { searchParams } = new URL(request.url);
    const number = searchParams.get("number")?.trim() || searchParams.get("id")?.trim() || searchParams.get("order")?.trim() || "";
    const phone = searchParams.get("phone")?.trim() || "";

    if (number) {
      let customerSession: CustomerSessionPayload | null = null;
      if (!phone) {
        const authError = await requireAdminRequest(request);
        if (authError) {
          customerSession = verifySignedCustomerSession(request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value);
          if (!customerSession || customerSession.exp <= Math.floor(Date.now() / 1000) || !customerSession.verified || (!customerSession.email && !customerSession.phone)) {
            return NextResponse.json({ ok: false, error: "A phone number or verified customer session is required to look up an order." }, { status: 401 });
          }
        }
      }
      const order = await getSupabaseOrder(number, phone || undefined);
      if (!order) {
        return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
      }
      if (customerSession) {
        const ownsByEmail = Boolean(customerSession.email && order.customerEmail?.toLowerCase() === customerSession.email.toLowerCase());
        const sessionPhone = customerSession.phone?.replace(/\D/g, "").slice(-10);
        const ownsByPhone = Boolean(sessionPhone && sessionPhone.length === 10 && order.customerPhone.replace(/\D/g, "").endsWith(sessionPhone));
        if (!ownsByEmail && !ownsByPhone) return NextResponse.json({ ok: false, error: "Order not found for this customer." }, { status: 404 });
      }
      return NextResponse.json({ ok: true, order, source: "supabase" });
    }

    if (phone) {
      if (phone.replace(/\D/g, "").length < 10) {
        return NextResponse.json({ ok: false, error: "Enter the customer phone number used for the order." }, { status: 400 });
      }
      const orders = await getSupabaseOrdersForPhone(phone);
      if (!orders.length) return NextResponse.json({ ok: false, error: "No orders were found for that phone number." }, { status: 404 });
      return NextResponse.json({ ok: true, order: orders[0], orders, source: "supabase" });
    }

    const authError = await requireAdminRequest(request);
    if (authError) return authError;
    const orders = await getSupabaseOrders();
    return NextResponse.json({ ok: true, orders, total: orders.length });
  } catch (error) {
    console.error("[GET_ORDERS_ERROR]", error);
    return supabaseErrorResponse(error, "Failed to fetch orders");
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSupabaseConfigured();
    const body = await request.json() as {
      customerName: string;
      customerEmail?: string;
      customerPhone: string;
      area: string;
      address: string;
      notes?: string;
      paymentMethod: string;
      items: DbOrderItem[];
      subtotal: number;
      discount?: number;
      deliveryFee?: number;
      total?: number;
      paymentStatus?: "pending" | "verification_pending" | "paid" | "rejected";
    };

    if (!body.customerName || !body.customerPhone || !body.address) {
      return NextResponse.json(
        { error: "Customer name, phone, and delivery address are required." },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "Order must contain at least one item." },
        { status: 400 }
      );
    }

    let settings: Awaited<ReturnType<typeof getSupabaseSettings>> = null;
    try {
      settings = await getSupabaseSettings();
    } catch (error) {
      if (!isSupabaseSchemaMismatch(error)) throw error;
      console.warn("Store settings schema is unavailable; allowing order creation without configured kitchen restrictions.");
    }
    if (settings) {
      const availability = getKitchenAvailability(settings);
      if (!availability.available) return NextResponse.json({ error: availability.reason, schedule: availability.schedule }, { status: 409 });
    }

    const order = {
      id: crypto.randomUUID(),
      number: `#HMF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      customerName: body.customerName,
      customerEmail: body.customerEmail,
      customerPhone: body.customerPhone,
      area: body.area || "Bahawalpur",
      address: body.address,
      notes: body.notes,
      paymentMethod: body.paymentMethod || "Cash on Delivery",
      items: body.items,
      subtotal: body.subtotal,
      discount: body.discount || 0,
      deliveryFee: body.deliveryFee || 0,
      total: body.total || 0,
      paymentStatus: body.paymentStatus || "pending",
      status: "pending" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const syncedOrder = await insertSupabaseOrder(order);
    const warnings: string[] = [];

    if (body.customerEmail && body.customerEmail.includes("@")) {
      try {
        await upsertSupabaseCustomer({
          name: body.customerName,
          email: body.customerEmail,
          phone: body.customerPhone,
          addresses: [`${body.address}, ${body.area || "Bahawalpur"}`],
        });
      } catch (error) {
        console.error("[ORDER_CUSTOMER_SYNC_ERROR]", { orderNumber: syncedOrder.number, error });
        warnings.push("The order was saved, but the customer profile could not be updated.");
      }
    }
    try {
      await insertSupabaseNotification({
        type: "order_created",
        title: `New order ${syncedOrder.number}`,
        body: `${syncedOrder.customerName} placed a new order.`,
        orderNumber: syncedOrder.number,
        priority: "high",
      });
    } catch (error) {
      console.error("[ORDER_NOTIFICATION_ERROR]", { orderNumber: syncedOrder.number, error });
      warnings.push("The order was saved, but the kitchen notification could not be created.");
    }

    return NextResponse.json({ ok: true, order: syncedOrder, warnings }, { status: 201 });
  } catch (error) {
    console.error("[CREATE_ORDER_ERROR]", error);
    return supabaseErrorResponse(error, "Failed to create order");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSupabaseConfigured();
    const session = await readAdminSession((await cookies()).get("hmf_admin_session")?.value, process.env.HMF_ADMIN_SESSION_SECRET);
    if (!session) return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
    const body = await request.json() as {
      number: string;
      status: DbOrderStatus;
      riderName?: string;
      riderPhone?: string;
      estimatedDelivery?: string;
      paymentStatus?: "pending" | "verification_pending" | "paid" | "rejected";
      paymentSlipUrl?: string;
      paymentSlipName?: string;
      customerNote?: string;
      adminNotes?: string;
      adminMediaUrl?: string;
    };

    if (!body.number || !body.status) {
      return NextResponse.json(
        { error: "Order number and updated status are required." },
        { status: 400 }
      );
    }

    const remoteUpdated = await updateSupabaseOrder(body.number, body.status, {
      riderName: body.riderName,
      riderPhone: body.riderPhone,
      estimatedDelivery: body.estimatedDelivery,
      paymentStatus: body.paymentStatus,
      paymentSlipUrl: body.paymentSlipUrl,
      paymentSlipName: body.paymentSlipName,
      customerNote: body.customerNote,
      adminNotes: body.adminNotes,
      adminMediaUrl: body.adminMediaUrl,
    });
    const warnings: string[] = [];
    if (remoteUpdated) {
      try {
        await insertSupabaseNotification({
          type: "order_status",
          title: `Order ${remoteUpdated.number} updated`,
          body: `Order status changed to ${remoteUpdated.status}.`,
          orderNumber: remoteUpdated.number,
        });
      } catch (error) {
        console.error("[ORDER_STATUS_NOTIFICATION_ERROR]", { orderNumber: remoteUpdated.number, error });
        warnings.push("The order update was saved, but its admin notification could not be created.");
      }
    }
    if (!remoteUpdated) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, order: remoteUpdated, warnings });
  } catch (error) {
    console.error("[UPDATE_ORDER_ERROR]", error);
    return supabaseErrorResponse(error, "Failed to update order status");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertSupabaseConfigured();
    const session = await readAdminSession((await cookies()).get("hmf_admin_session")?.value, process.env.HMF_ADMIN_SESSION_SECRET);
    if (!session) return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
    const number = new URL(request.url).searchParams.get("number")?.trim();
    if (!number) return NextResponse.json({ error: "Order number is required." }, { status: 400 });

    const existing = await getSupabaseOrder(number);
    if (!existing) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    await deleteSupabaseOrder(number);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE_ORDER_ERROR]", error);
    return supabaseErrorResponse(error, "Failed to delete order");
  }
}
