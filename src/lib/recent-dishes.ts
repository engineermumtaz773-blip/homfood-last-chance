const STORAGE_KEY = "hmf_recent_dishes_v1";
export const RECENT_DISHES_EVENT = "hmf_recent_dishes_changed";

export function getRecentDishIds() {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 8)
      : [];
  } catch {
    return [];
  }
}

export function recordRecentDish(id: number) {
  if (typeof window === "undefined" || !Number.isInteger(id) || id <= 0) return;
  const next = [id, ...getRecentDishIds().filter((current) => current !== id)].slice(0, 8);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(RECENT_DISHES_EVENT));
}
