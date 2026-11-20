import type { StoreSettings } from "@/lib/store-db";

export type KitchenAvailability = {
  available: boolean;
  reason: string;
  schedule: string;
  activeSlot?: string;
};

function minutes(value: string | undefined) {
  if (typeof value !== "string") return Number.NaN;
  const [hours, mins] = value.split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(mins) && hours >= 0 && hours < 24 && mins >= 0 && mins < 60
    ? hours * 60 + mins
    : Number.NaN;
}

export function getKitchenAvailability(settings: StoreSettings, now = new Date()): KitchenAvailability {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "0";
  const today = part("weekday");
  const businessHours = settings.businessHours || ({} as StoreSettings["businessHours"]);
  const weeklySchedule = businessHours.schedule || {};
  const day = weeklySchedule[today];
  const schedule = Object.entries(weeklySchedule)
    .map(([name, value]) => `${name}: ${value?.enabled ? `${value.open}–${value.close}` : "Closed"}`)
    .join(" · ");

  const adminClosingNotice = typeof businessHours.holidayMessage === "string" ? businessHours.holidayMessage.trim() : "";
  if (businessHours.holidayMode) return { available: false, reason: adminClosingNotice || "The kitchen is temporarily closed for a holiday.", schedule };
  if (settings.restaurant?.isOpen === false) return { available: false, reason: "The kitchen is temporarily closed by the admin.", schedule };
  if (Object.keys(weeklySchedule).length === 0) {
    return { available: true, reason: "Online ordering is open. Kitchen hours have not been configured yet.", schedule: "Hours to be confirmed" };
  }
  if (!day?.enabled) return { available: false, reason: `The kitchen is closed on ${today}.`, schedule };

  const current = Number(part("hour")) * 60 + Number(part("minute"));
  const opensAt = minutes(day.open);
  const closesAt = minutes(day.close);
  if (!Number.isFinite(opensAt) || !Number.isFinite(closesAt)) return { available: false, reason: `Opening hours for ${today} need to be configured.`, schedule };
  if (current < opensAt || current >= closesAt) {
    return { available: false, reason: `The kitchen is closed right now. Today’s hours are ${day.open}–${day.close}.`, schedule };
  }

  const slots = Array.isArray(businessHours.mealSlots) ? businessHours.mealSlots : [];
  if (slots.length === 0) return { available: true, reason: "Online ordering is open during kitchen hours.", schedule };
  const activeSlot = slots.find((slot) => slot.enabled && current >= minutes(slot.open) && current < minutes(slot.close));
  if (!activeSlot) return { available: false, reason: "No meal slot is accepting orders right now.", schedule };
  return { available: true, reason: `${activeSlot.name} orders are open.`, schedule, activeSlot: activeSlot.name };
}
