import type { DbOrder, DbOrderItem, DbOrderStatus } from "@/lib/store-db";

export type OrderSubmission = {
  name: string;
  phone: string;
  email?: string;
  area: string;
  address: string;
  notes: string;
  payment: string;
  items: Array<{ id: number; portion: string; quantity: number; note?: string; name?: string; price?: number }>;
  subtotal?: number;
  discount?: number;
  deliveryFee?: number;
  total?: number;
};

export type LiveOrderStatus = {
  number: string;
  total: number;
  status: "new" | "confirmed" | "preparing" | "ready" | "delivering" | "arriving" | "completed" | "cancelled";
  created_at?: string;
  updated_at: string;
  customerName?: string;
  customerPhone?: string;
  area?: string;
  riderName?: string;
  riderPhone?: string;
  estimatedDelivery?: string;
  items: DbOrderItem[];
  itemsSummary?: string;
  address?: string;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  paymentMethod: string;
  paymentStatus?: DbOrder["paymentStatus"];
  paymentSlipUrl?: string;
  paymentSlipName?: string;
  customerNote?: string;
  notes?: string;
  adminNotes?: string;
  adminMediaUrl?: string;
  cancellationReason?: string;
  persistenceWarnings?: string[];
};

const statusMap: Record<DbOrderStatus | "new" | "ready" | "delivering" | "arriving" | "completed", LiveOrderStatus["status"]> = {
  pending: "new",
  new: "new",
  confirmed: "confirmed",
  preparing: "preparing",
  ready: "ready",
  out_for_delivery: "delivering",
  delivering: "delivering",
  arriving: "arriving",
  delivered: "completed",
  completed: "completed",
  cancelled: "cancelled",
};

function mapLiveOrder(order: DbOrder): LiveOrderStatus {
  return {
    number: order.number,
    total: order.total,
    status: statusMap[order.status] || "new",
    created_at: order.createdAt,
    updated_at: order.updatedAt,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    area: order.area,
    riderName: order.riderName,
    riderPhone: order.riderPhone,
    estimatedDelivery: order.estimatedDelivery,
    items: order.items,
    itemsSummary: order.items.map((item) => `${item.name} (${item.portion}) × ${item.quantity}`).join(", "),
    address: order.address,
    subtotal: order.subtotal,
    discount: order.discount,
    deliveryFee: order.deliveryFee,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    paymentSlipUrl: order.paymentSlipUrl,
    paymentSlipName: order.paymentSlipName,
    customerNote: order.customerNote,
    notes: order.notes,
    adminNotes: order.adminNotes,
    adminMediaUrl: order.adminMediaUrl,
    cancellationReason: order.cancellationReason,
  };
}

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
  const data = await res.json() as { ok?: boolean; order?: DbOrder; warnings?: string[] };
  if (!data.ok || !data.order) throw new Error("The database did not return the saved order.");
  return {
    ...mapLiveOrder(data.order),
    ...(Array.isArray(data.warnings) && data.warnings.length ? { persistenceWarnings: data.warnings } : {}),
  };
}

export async function getLiveOrderStatus(number: string, phone: string): Promise<LiveOrderStatus> {
  const query = new URLSearchParams();
  if (number.trim()) query.set("number", number.trim());
  if (phone.trim()) query.set("phone", phone.trim());
  if (!query.size) throw new Error("Enter an order number or customer phone number.");
  const res = await fetch(`/api/orders?${query}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(error?.error || `Order tracking failed (${res.status}).`);
  }
  const data = await res.json() as { ok?: boolean; order?: DbOrder };
  if (data.ok && data.order) return mapLiveOrder(data.order);
  throw new Error("The database did not return the requested order.");
}
