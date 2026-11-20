"use client";

import { useEffect, useState } from "react";
import { FAVORITES_CHANGE_EVENT, getFavoriteDishIds, setFavoriteDishIds } from "@/lib/favorites";

export function FavoriteButton({ dishId }: { dishId: number }) {
  const [favorite, setFavorite] = useState(false);

  useEffect(() => {
    const sync = () => setFavorite(getFavoriteDishIds().includes(dishId));
    sync();
    window.addEventListener(FAVORITES_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(FAVORITES_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [dishId]);

  function toggle() {
    const ids = getFavoriteDishIds();
    setFavorite(!ids.includes(dishId));
    setFavoriteDishIds(ids.includes(dishId) ? ids.filter((id) => id !== dishId) : [...ids, dishId]);
  }

  return (
    <button type="button" className="dish-favorite-button" onClick={toggle} aria-pressed={favorite} aria-label={favorite ? "Remove from favorites" : "Add to favorites"}>
      {favorite ? "♥" : "♡"}
    </button>
  );
}
