"use client";

import { useEffect } from "react";
import { FAVORITES_CHANGE_EVENT, getFavoriteDishIds, setFavoriteDishIds } from "@/lib/favorites";

export function FavoritesSyncRuntime() {
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    fetch("/api/favorites", { cache: "no-store" }).then(async (response) => {
      if (response.status === 401 || response.status === 404) return;
      if (!response.ok) throw new Error(`Favorite sync failed (${response.status}).`);
      const data = await response.json() as { favoriteDishIds?: number[] };
      if (!active || !Array.isArray(data.favoriteDishIds)) return;
      const local = getFavoriteDishIds();
      const merged = [...new Set([...data.favoriteDishIds, ...local])].slice(0, 100);
      setFavoriteDishIds(merged);
      const save = await fetch("/api/favorites", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favoriteDishIds: merged }),
      });
      if (!save.ok) throw new Error(`Favorite sync failed (${save.status}).`);
    }).catch((error: unknown) => console.error("Could not synchronize customer favorites.", error));
    const onChanged = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void fetch("/api/favorites", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ favoriteDishIds: getFavoriteDishIds() }),
        }).then((response) => {
          if (response.status !== 401 && response.status !== 404 && !response.ok) {
            throw new Error(`Favorite sync failed (${response.status}).`);
          }
        }).catch((error: unknown) => console.error("Could not save customer favorites.", error));
      }, 350);
    };
    window.addEventListener(FAVORITES_CHANGE_EVENT, onChanged);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener(FAVORITES_CHANGE_EVENT, onChanged);
    };
  }, []);
  return null;
}
