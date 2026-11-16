export type OrderSubmission = {
  name: string;
  phone: string;
  email?: string;
  area: string;
  address: string;
  notes: string;
  payment: string;
  promo_code: string;
  items: Array<{ id: number; portion: string; quantity: number; note?: string; name?: string; price?: number }>;
  subtotal?: number;
  discount?: number;
  deliveryFee?: number;
  total?: number;
};

export type LiveOrderStatus = {
  number: string;
  total: number;
  status: "new" | "preparing" | "ready" | "delivering" | "arriving" | "completed" | "cancelled";
  created_at?: string;
  updated_at: string;
  riderName?: string;
  riderPhone?: string;
  itemsSummary?: string;
  address?: string;
  paymentStatus?: "pending" | "verification_pending" | "paid" | "rejected";
  customerNote?: string;
  adminNotes?: string;
  adminMediaUrl?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseStatus(value: unknown): LiveOrderStatus["status"] | null {
  return value === "new" ||
    value === "preparing" ||
    value === "ready" ||
    value === "delivering" ||
    value === "arriving" ||
    value === "completed" ||
    value === "cancelled"
    ? value
    : null;
}

const statusMap: Record<string, LiveOrderStatus["status"]> = {
  pending: "new",
  new: "new",
  preparing: "preparing",
  ready: "ready",
  out_for_delivery: "delivering",
  delivering: "delivering",
  arriving: "arriving",
  delivered: "completed",
  completed: "completed",
  cancelled: "cancelled",
};

export async function createLiveOrder(order: OrderSubmission): Promise<LiveOrderStatus> {
  const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: order.name,
        customerPhone: order.phone,
        customerEmail: order.email,
        area: order.area,
        address: order.address,
        notes: order.notes,
        paymentMethod: order.payment,
        items: order.items.map((item) => ({
          id: item.id,
          name: item.name || `Dish #${item.id}`,
          portion: item.portion,
          price: item.price || 0,
          quantity: item.quantity,
          specialInstructions: item.note,
        })),
        subtotal: order.subtotal || 0,
        discount: order.discount || 0,
        deliveryFee: order.deliveryFee || 0,
        total: order.total || order.subtotal || 0,
      }),
      cache: "no-store",
    });

  if (!res.ok) {
    const data = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error || `Order could not be saved (${res.status}).`);
  }
  const data = await res.json() as { ok?: boolean; order?: { number: string; total: number; status: string; createdAt: string; riderName?: string; riderPhone?: string } };
  if (!data.ok || !data.order) throw new Error("The database did not return the saved order.");
  return {
    number: data.order.number,
    total: data.order.total,
    status: statusMap[data.order.status] || "new",
    created_at: data.order.createdAt,
    updated_at: data.order.createdAt,
    riderName: data.order.riderName,
    riderPhone: data.order.riderPhone,
  };
}

export async function getLiveOrderStatus(number: string, phone: string): Promise<LiveOrderStatus> {
  const query = new URLSearchParams({ number, phone });
  const res = await fetch(`/api/orders?${query}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(error?.error || `Order tracking failed (${res.status}).`);
  }
  const data = await res.json() as {
    ok?: boolean;
    order?: {
      number: string;
      total: number;
      status: string;
      createdAt?: string;
      updatedAt: string;
      riderName?: string;
      riderPhone?: string;
      address?: string;
      items?: Array<{ name: string; portion: string; quantity: number }>;
      paymentStatus?: LiveOrderStatus["paymentStatus"];
      customerNote?: string;
      adminNotes?: string;
      adminMediaUrl?: string;
    };
  };
  if (data.ok && data.order) {
    const o = data.order;
    return {
      number: o.number,
      total: o.total,
      status: statusMap[o.status] || "new",
      created_at: o.createdAt || o.updatedAt,
      updated_at: o.updatedAt,
      riderName: o.riderName,
      riderPhone: o.riderPhone,
      address: o.address,
      itemsSummary: o.items ? o.items.map((i) => `${i.name} (${i.portion}) × ${i.quantity}`).join(", ") : undefined,
      paymentStatus: o.paymentStatus,
      customerNote: o.customerNote,
      adminNotes: o.adminNotes,
      adminMediaUrl: o.adminMediaUrl,
    }
  }
  throw new Error("The database did not return the requested order.");
}
