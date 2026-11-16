import { NextRequest, NextResponse } from "next/server";
import {
  assertSupabaseConfigured,
  getSupabaseDishes,
  upsertSupabaseDish,
  deleteSupabaseDish,
  setSupabaseDishAvailability,
} from "@/lib/supabase-server";
import { supabaseErrorResponse } from "@/lib/api-errors";
import { requireAdminRequest } from "@/lib/admin-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    assertSupabaseConfigured();
    const category = new URL(request.url).searchParams.get("category") || undefined;
    const dishes = await getSupabaseDishes(category);
    const categories = [...new Set(dishes.flatMap((dish) => [dish.category, ...(dish.categories || [])]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return NextResponse.json(
      { dishes, categories },
      { headers: { "Cache-Control": "no-store, max-age=0", "X-Data-Source": "supabase" } }
    );
  } catch (error) {
    console.error("Failed to load menu database:", error);
    return supabaseErrorResponse(error, "Menu data is temporarily unavailable.", 503);
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
    } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Dish name is required" }, { status: 400 });
    }
    const cat = (category || (Array.isArray(categories) && categories[0]) || "Dinner").trim();

    if (!Array.isArray(portions) || portions.length === 0) {
      return NextResponse.json({ error: "At least one portion with a price in PKR is required" }, { status: 400 });
    }

    const validPortions = portions.map((p: { name?: string; price?: number }) => ({
      name: String(p.name || "regular").trim(),
      price: Math.max(0, Number(p.price) || 0),
    }));

    const dishInput = {
      id: typeof id === "number" ? id : undefined,
      name: name.trim(),
      category: cat,
      categories: Array.isArray(categories) && categories.length > 0 ? categories : [cat],
      description: typeof description === "string" ? description.trim() : "",
      imageUrl: typeof imageUrl === "string" ? imageUrl.trim() : "",
      portions: validPortions,
      servingSize: typeof servingSize === "string" ? servingSize : undefined,
      dietaryTags: Array.isArray(dietaryTags) ? dietaryTags : [],
      available: typeof available === "boolean" ? available : true,
      soldOut: typeof soldOut === "boolean" ? soldOut : false,
      featured: typeof featured === "boolean" ? featured : false,
    };
    assertSupabaseConfigured();
    const savedDish = await upsertSupabaseDish(dishInput);

    return NextResponse.json({ success: true, dish: savedDish });
  } catch (error) {
    console.error("Failed to save menu dish:", error);
    return supabaseErrorResponse(error, "Could not save dish to database");
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

    return NextResponse.json({ success: true, message: `Dish ${id} deleted successfully` });
  } catch (error) {
    console.error("Failed to delete dish:", error);
    return supabaseErrorResponse(error, "Could not delete dish");
  }
}
