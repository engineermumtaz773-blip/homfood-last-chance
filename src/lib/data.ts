export type Portion = { name: string; price: number };

export type Dish = {
  id: number;
  name: string;
  description: string;
  category: string;
  categories?: string[];
  image: string;
  imageUrl?: string;
  portions: Portion[];
  servingSize?: string;
  dietaryTags?: string[];
  allergens?: string[];
  nutrition?: { calories?: number; proteinGrams?: number; carbsGrams?: number; fatGrams?: number };
  spiceLevel?: "mild" | "medium" | "hot";
  rating?: number;
  ratingCount?: number;
  available?: boolean;
  featured?: boolean;
  soldOut?: boolean;
  translations?: Partial<Record<"ur" | "sd" | "ur-Latn", { name: string; description: string }>>;
};

export async function getDishes(): Promise<Dish[]> {
  if (typeof window !== "undefined") throw new Error("Menu reads must execute through the server API.");
  const { assertSupabaseConfigured, getSupabaseDishes } = await import("@/lib/supabase-server");
  assertSupabaseConfigured();
  return getSupabaseDishes();
}

export async function getDishesSafely(): Promise<Dish[] | null> {
  try {
    return await getDishes();
  } catch (error) {
    console.error("[MENU_DATA_UNAVAILABLE]", error);
    return null;
  }
}

export function dishesForCategoryOrAvailable(dishes: Dish[], category: string): Dish[] {
  const normalized = category.trim().toLocaleLowerCase();
  return dishes.filter((dish) =>
    [dish.category, ...(dish.categories || [])].some((item) => item.trim().toLocaleLowerCase() === normalized),
  );
}

export function whatsappUrl(message: string) {
  return `https://wa.me/923096648932?text=${encodeURIComponent(message)}`;
}
