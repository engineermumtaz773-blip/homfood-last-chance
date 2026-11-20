export type DeliveryZone = {
  id: string;
  zone_name: string;
  delivery_fee: number;
  min_order_amount: number;
  estimated_minutes: number;
};

export const BAHAWALPUR_ZONES: DeliveryZone[] = [
  { id: "bahawalpur-city", zone_name: "Bahawalpur city", delivery_fee: 100, min_order_amount: 0, estimated_minutes: 40 },
  { id: "model-town", zone_name: "Model Town", delivery_fee: 120, min_order_amount: 0, estimated_minutes: 45 },
  { id: "university-chowk", zone_name: "University Chowk", delivery_fee: 100, min_order_amount: 0, estimated_minutes: 40 },
  { id: "other-bahawalpur-area", zone_name: "Other Bahawalpur area", delivery_fee: 150, min_order_amount: 0, estimated_minutes: 55 },
];

export function calculateDeliveryFee(
  zone: Pick<DeliveryZone, "delivery_fee"> | undefined,
  subtotal: number,
  freeDeliveryThreshold: number,
) {
  if (!zone) return 0;
  return freeDeliveryThreshold > 0 && subtotal >= freeDeliveryThreshold ? 0 : zone.delivery_fee;
}
