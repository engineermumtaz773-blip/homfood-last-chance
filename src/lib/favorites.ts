"use client";

export const FAVORITES_STORAGE_KEY = "hmf_favorite_dishes_v1";
export const FAVORITES_CHANGE_EVENT = "hmf_favorites_changed";

export function getFavoriteDishIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number).filter((n) => Number.isFinite(n)) : [];
  } catch {
    return [];
  }
}

export function isDishFavorite(dishId: number): boolean {
  const ids = getFavoriteDishIds();
  return ids.includes(dishId);
}

export function setFavoriteDishIds(ids: number[]) {
  if (typeof window === "undefined") return;
  try {
    const validIds = [...new Set(ids)].filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, 100);
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(validIds));
    window.dispatchEvent(new CustomEvent(FAVORITES_CHANGE_EVENT, { detail: { totalFavorites: validIds.length } }));
  } catch {
    return;
  }
}

export function toggleFavoriteDish(dishId: number): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ids = getFavoriteDishIds();
    const index = ids.indexOf(dishId);
    let isNowFavorite = false;
    let nextIds: number[];

    if (index >= 0) {
      nextIds = ids.filter((id) => id !== dishId);
      isNowFavorite = false;
    } else {
      nextIds = [...ids, dishId];
      isNowFavorite = true;
    }

    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(nextIds));

    // Dispatch global event for instant UI sync
    window.dispatchEvent(
      new CustomEvent(FAVORITES_CHANGE_EVENT, {
        detail: { dishId, isFavorite: isNowFavorite, totalFavorites: nextIds.length },
      })
    );

    return isNowFavorite;
  } catch {
    return false;
  }
}

export function getFavoritesCount(): number {
  return getFavoriteDishIds().length;
}
