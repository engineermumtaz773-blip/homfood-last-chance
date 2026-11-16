import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, getSupabaseCategories, getSupabaseDishes, upsertSupabaseCategory, deleteSupabaseCategory } from "@/lib/supabase-server";
import { supabaseErrorResponse } from "@/lib/api-errors";
import { requireAdminRequest } from "@/lib/admin-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    assertSupabaseConfigured();
    let categories: string[] = [];
    try {
      categories = await getSupabaseCategories();
    } catch (error) {
      console.warn("Category table read failed; deriving categories from menu items:", error);
    }
    const resolvedCategories = categories.length > 0
      ? categories
      : [...new Set((await getSupabaseDishes()).flatMap((dish) => [dish.category, ...(dish.categories || [])]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return NextResponse.json(
      { success: true, categories: resolvedCategories },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("Failed to load categories:", error);
    return supabaseErrorResponse(error, "Categories are temporarily unavailable.", 503);
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireAdminRequest(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid payload" },
        { status: 400 }
      );
    }

    const { name, oldName } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Category name is required" },
        { status: 400 }
      );
    }

    let categories: string[];
    if (oldName && typeof oldName === "string" && oldName.trim()) {
      categories = await upsertSupabaseCategory(name.trim(), oldName.trim());
    } else {
      categories = await upsertSupabaseCategory(name.trim());
    }

    return NextResponse.json({
      success: true,
      message: "Categories updated successfully",
      categories,
    });
  } catch (error) {
    console.error("Failed to save category:", error);
    return supabaseErrorResponse(error, "Failed to save category");
  }
}

export async function DELETE(request: NextRequest) {
  const authError = await requireAdminRequest(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Category name parameter is required" },
        { status: 400 }
      );
    }

    assertSupabaseConfigured();
    const categories = await deleteSupabaseCategory(name.trim());
    return NextResponse.json({
      success: true,
      message: `Category "${name}" deleted successfully`,
      categories,
    });
  } catch (error) {
    console.error("Failed to delete category:", error);
    return supabaseErrorResponse(error, "Failed to delete category");
  }
}
