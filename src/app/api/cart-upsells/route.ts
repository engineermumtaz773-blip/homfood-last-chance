import { NextResponse } from "next/server";
import { getFallbackDishes } from "@/lib/data";
import { isSupabaseSchemaMismatch } from "@/lib/supabase-schema";
import { getSupabaseCartUpsells, getSupabaseDishes, isSupabaseConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const suggestions = isSupabaseConfigured ? await getSupabaseCartUpsells() : [];
    if (suggestions.length) return NextResponse.json({ items: suggestions }, { headers: { "Cache-Control": "no-store" } });
    if (!isSupabaseConfigured) {
      return NextResponse.json({
        items: getFallbackDishes().slice(0, 4).map((dish) => ({ dish, label: "Popular with your order", defaultQty: 1 })),
        fallback: true,
      }, { headers: { "Cache-Control": "no-store" } });
    }
    const menu = await getSupabaseDishes();
    return NextResponse.json({
      items: menu.filter((dish) => dish.available !== false && !dish.soldOut).slice(0, 4)
        .map((dish) => ({ dish, label: "Popular with your order", defaultQty: 1 })),
      fallback: true,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (!isSupabaseSchemaMismatch(error)) {
      console.error("[GET_CART_UPSELLS_ERROR]", error);
      return NextResponse.json({ error: "Cart suggestions are temporarily unavailable." }, { status: 503 });
    }
    console.warn("Cart upsell table is missing; using menu items for suggestions.");
    return NextResponse.json({
      items: getFallbackDishes().slice(0, 4).map((dish) => ({ dish, label: "Popular with your order", defaultQty: 1 })),
      fallback: true,
    }, { headers: { "Cache-Control": "no-store" } });
  }
}
