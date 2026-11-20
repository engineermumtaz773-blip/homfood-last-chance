import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  assertSupabaseConfigured,
  getSupabaseDishes,
  getSupabaseErrorPayload,
  upsertSupabaseDish,
  deleteSupabaseDish,
  setSupabaseDishAvailability,
} from "@/lib/supabase-server";
import { supabaseErrorResponse } from "@/lib/api-errors";
import { requireAdminRequest } from "@/lib/admin-request";
import { getFallbackDishes, type Dish } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function revalidateMenuPaths() {
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
}

export async function GET(request: NextRequest) {
  const category = new URL(request.url).searchParams.get("category") || undefined;
  try {
    assertSupabaseConfigured();
    const dishes = await getSupabaseDishes(category);
    const categories = [...new Set(dishes.flatMap((dish) => [dish.category, ...(dish.categories || [])]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return NextResponse.json(
      { dishes, categories, source: "supabase" },
      { headers: { "Cache-Control": "no-store, max-age=0", "X-Data-Source": "supabase" } }
    );
  } catch (error) {
    console.error("Failed to load menu database:", error);
    const fallback = getFallbackDishes();
    const dishes = category && category.toLocaleLowerCase() !== "all"
      ? fallback.filter((dish) => [dish.category, ...(dish.categories || [])].some((name) => name.toLocaleLowerCase() === category.toLocaleLowerCase()))
      : fallback;
    const categories = [...new Set(dishes.flatMap((dish) => [dish.category, ...(dish.categories || [])]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return NextResponse.json(
      { dishes, categories, source: isSupabaseConfigured ? "local-fallback" : "local" },
      { headers: { "Cache-Control": "no-store, max-age=0", "X-Data-Source": "local-fallback" } }
    );
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireAdminRequest(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const {
      name,
      category,
      categories,
      portions,
      description,
      imageUrl,
      id,
      available,
      soldOut,
      featured,
      servingSize,
      dietaryTags,
      dailyStockLimit,
      remainingStock,
      nutrition,
      allergens,
      addons,
    } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Dish name is required" }, { status: 400 });
    }
    const categoryList = Array.isArray(categories) ? categories.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0) : [];
    const cat = (typeof category === "string" && category.trim()) || categoryList[0] || "Dinner";

    if (!Array.isArray(portions) || portions.length === 0) {
      return NextResponse.json({ error: "At least one portion with a price in PKR is required" }, { status: 400 });
    }
    if (![dailyStockLimit, remainingStock].every((value) => value === undefined || value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0))) {
      return NextResponse.json({ error: "Stock limits must be non-negative numbers." }, { status: 400 });
    }
    if (nutrition !== undefined && (!nutrition || typeof nutrition !== "object" || Array.isArray(nutrition))) {
      return NextResponse.json({ error: "Nutrition must be a valid object." }, { status: 400 });
    }
    if (nutrition && !Object.values(nutrition).every((value) => value === undefined || value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0))) {
      return NextResponse.json({ error: "Nutrition values must be non-negative numbers." }, { status: 400 });
    }
    if (allergens !== undefined && (!Array.isArray(allergens) || allergens.some((value: unknown) => typeof value !== "string"))) {
      return NextResponse.json({ error: "Allergens must be a list of names." }, { status: 400 });
    }
    if (addons !== undefined && !Array.isArray(addons)) {
      return NextResponse.json({ error: "Add-ons must be a list." }, { status: 400 });
    }

    if (portions.some((portion: unknown) => !portion || typeof portion !== "object" || Array.isArray(portion))) {
      return NextResponse.json({ error: "Each portion must include a name and price." }, { status: 400 });
    }
    const validPortions = portions.map((p: { name?: string; price?: number }) => ({
      name: String(p.name || "regular").trim(),
      price: Math.max(0, Number(p.price) || 0),
    }));

    const dishInput = {
      id: typeof id === "number" ? id : undefined,
      name: name.trim(),
      category: cat,
      categories: categoryList.length > 0 ? categoryList : [cat],
      description: typeof description === "string" ? description.trim() : "",
      imageUrl: typeof imageUrl === "string" ? imageUrl.trim() : "",
      portions: validPortions,
      servingSize: typeof servingSize === "string" ? servingSize : undefined,
      dietaryTags: Array.isArray(dietaryTags) ? dietaryTags : [],
      available: typeof available === "boolean" ? available : true,
      soldOut: typeof soldOut === "boolean" ? soldOut : false,
      featured: typeof featured === "boolean" ? featured : false,
      dailyStockLimit: dailyStockLimit === null || typeof dailyStockLimit === "number" ? dailyStockLimit : undefined,
      remainingStock: remainingStock === null || typeof remainingStock === "number" ? remainingStock : undefined,
      nutrition: nutrition as Dish["nutrition"] | undefined,
      allergens: Array.isArray(allergens) ? allergens as string[] : undefined,
      addons: Array.isArray(addons) ? addons : undefined,
    };
    assertSupabaseConfigured();
    const savedDish = await upsertSupabaseDish(dishInput);
    revalidateMenuPaths();

    return NextResponse.json({ success: true, dish: savedDish });
  } catch (error) {
    console.error("Failed to save menu dish:", error);
    const status = getSupabaseErrorPayload(error).status;
    return supabaseErrorResponse(error, "Could not save dish to database", status && status >= 400 && status < 500 ? status : 500);
  }
}

export async function PATCH(request: NextRequest) {
  const authError = await requireAdminRequest(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { id, available } = body;
    if (typeof id !== "number") {
      return NextResponse.json({ error: "Dish ID is required" }, { status: 400 });
    }

    if (typeof available === "boolean") {
      assertSupabaseConfigured();
      const updated = await setSupabaseDishAvailability(id, available);
      if (!updated) {
        return NextResponse.json({ error: "Dish not found" }, { status: 404 });
      }
      revalidateMenuPaths();
      return NextResponse.json({ success: true, dish: updated });
    }

    return NextResponse.json({ error: "No valid update field provided" }, { status: 400 });
  } catch (error) {
    console.error("Failed to update dish availability:", error);
    return supabaseErrorResponse(error, "Could not update dish");
  }
}

export async function DELETE(request: NextRequest) {
  const authError = await requireAdminRequest(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get("id");
    const id = Number(idParam);
    if (!idParam || Number.isNaN(id)) {
      return NextResponse.json({ error: "Valid dish ID is required" }, { status: 400 });
    }

    assertSupabaseConfigured();
    const deleted = await deleteSupabaseDish(id);
    if (!deleted) {
      return NextResponse.json({ error: "Dish not found" }, { status: 404 });
    }

    revalidateMenuPaths();
    return NextResponse.json({ success: true, message: `Dish ${id} deleted successfully` });
  } catch (error) {
    console.error("Failed to delete dish:", error);
    return supabaseErrorResponse(error, "Could not delete dish");
  }
}
