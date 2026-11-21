"use client";

export const customerNotificationTypes = [
  "orderUpdates",
  "deliveryUpdates",
  "paymentUpdates",
  "promotions",
  "menuUpdates",
] as const;

export type CustomerNotificationType = (typeof customerNotificationTypes)[number];
export type CustomerNotificationPreferences = Record<CustomerNotificationType, boolean>;

const storageKey = "hmf_notification_preferences_v1";
const defaults: CustomerNotificationPreferences = {
  orderUpdates: false,
  deliveryUpdates: false,
  paymentUpdates: false,
  promotions: false,
  menuUpdates: false,
};

export function getCustomerNotificationPreferences(): CustomerNotificationPreferences {
  if (typeof window === "undefined") return defaults;
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return defaults;
    return Object.fromEntries(
      customerNotificationTypes.map((type) => [type, (saved as Record<string, unknown>)[type] === true]),
    ) as CustomerNotificationPreferences;
  } catch (error) {
    console.warn("Could not read notification preferences.", error);
    return defaults;
  }
}

export function saveCustomerNotificationPreferences(preferences: CustomerNotificationPreferences) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(preferences));
  } catch (error) {
    console.warn("Could not save notification preferences.", error);
  }
}

export async function requestCustomerNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

export function notifyCustomer(
  type: CustomerNotificationType,
  title: string,
  body: string,
  tag?: string,
) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted" || !getCustomerNotificationPreferences()[type]) return;
  try {
    new Notification(title, {
      body,
      icon: "/icons/app-icon-192.png",
      tag: tag || `homefood-${type}`,
    });
  } catch (error) {
    console.warn("Could not display a customer notification.", error);
  }
}
