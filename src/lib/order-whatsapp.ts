import type { DbOrderItem, DbPaymentStatus } from "@/lib/store-db";

export type WhatsAppOrder = {
  number: string;
  createdAt?: string;
  created_at?: string;
  customerName?: string;
  customerPhone?: string;
  area?: string;
  address?: string;
  items: DbOrderItem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  paymentStatus?: DbPaymentStatus;
  paymentSlipUrl?: string;
  notes?: string;
  customerNote?: string;
};

type WhatsAppSettings = {
  restaurant?: { name?: string; whatsapp?: string };
  social?: { whatsappBusiness?: string };
};

const money = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 });

export function normalizeWhatsAppNumber(value?: string) {
  let digits = (value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  else if (digits.startsWith("3") && digits.length === 10) digits = `92${digits}`;
  return digits || "923040537000";
}

export function buildOrderWhatsAppMessage(order: WhatsAppOrder, settings?: WhatsAppSettings) {
  const date = new Date(order.createdAt || order.created_at || "");
  const dateLabel = Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleString("en-PK");
  const itemLines = order.items.map((item) => {
    const instructions = item.specialInstructions ? `\n  Note: ${item.specialInstructions}` : "";
    return `- ${item.name} (${item.portion}) × ${item.quantity}: Rs. ${money.format(item.price * item.quantity)}${instructions}`;
  });
  const slipStatus = order.paymentSlipUrl || order.paymentStatus === "verification_pending"
    ? "Uploaded"
    : /raast|transfer|bank|digital/i.test(order.paymentMethod)
      ? "Pending"
      : "Not required";
  const notes = [order.notes, order.customerNote].filter((note): note is string => Boolean(note?.trim())).join("\n");
  const paymentMethod = order.paymentMethod === "Digital Payment"
    ? "MCB Raast QR"
    : order.paymentMethod;

  return [
    `Hello ${settings?.restaurant?.name || "Home Made Food"},`,
    `Order: ${order.number}`,
    `Date/Time: ${dateLabel}`,
    "",
    `Customer: ${order.customerName || "Customer"}`,
    `Phone: ${order.customerPhone || "Not provided"}`,
    `Delivery area: ${order.area || "Not provided"}`,
    `Address: ${order.address || "Not provided"}`,
    "",
    "Items:",
    ...itemLines,
    "",
    `Subtotal: Rs. ${money.format(order.subtotal)}`,
    `Discount: Rs. ${money.format(order.discount)}`,
    `Delivery: Rs. ${money.format(order.deliveryFee)}`,
    `Total: Rs. ${money.format(order.total)}`,
    `Payment method: ${paymentMethod}`,
    `Payment status: ${(order.paymentStatus || "pending").replace("_", " ")}`,
    `Payment slip: ${slipStatus}`,
    ...(order.number ? [`Track order: https://www.homefood.engineer/track-order?order=${encodeURIComponent(order.number)}${order.customerPhone ? `&phone=${encodeURIComponent(order.customerPhone)}` : ""}`] : []),
    ...(notes ? ["", `Customer notes / delivery timing:\n${notes}`] : []),
  ].join("\n");
}

export function getOrderWhatsAppNumber(settings?: WhatsAppSettings) {
  return normalizeWhatsAppNumber(settings?.restaurant?.whatsapp || settings?.social?.whatsappBusiness);
}
