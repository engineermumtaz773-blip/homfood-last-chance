import { NextRequest, NextResponse } from "next/server";
import { assertSupabaseConfigured, getSupabaseDeals, upsertSupabaseDeal, deleteSupabaseDeal } from "@/lib/supabase-server";
import { supabaseErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    assertSupabaseConfigured();
    const deals = await getSupabaseDeals();
    return NextResponse.json(deals, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Failed to load daily deals from database:", error);
    return supabaseErrorResponse(error, "Could not retrieve daily deals");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { id, title, description, regularPrice, discountedPrice, imageUrl, available } = body;
    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Deal title is required" }, { status: 400 });
    }
    const numRegular = Number(regularPrice);
    const numDiscounted = Number(discountedPrice);
    if (!Number.isFinite(numRegular) || !Number.isFinite(numDiscounted) || numRegular <= 0 || numDiscounted <= 0) {
      return NextResponse.json({ error: "Valid regular and discounted prices in PKR are required" }, { status: 400 });
    }

    const dealInput = {
      id: typeof id === "number" ? id : undefined,
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : "",
      regularPrice: numRegular,
      discountedPrice: numDiscounted,
      imageUrl: typeof imageUrl === "string" ? imageUrl.trim() : "",
      available: typeof available === "boolean" ? available : true,
    };
    assertSupabaseConfigured();
    const savedDeal = await upsertSupabaseDeal(dealInput);

    return NextResponse.json({ success: true, deal: savedDeal });
  } catch (error) {
    console.error("Failed to save daily deal:", error);
    return supabaseErrorResponse(error, "Could not save daily deal to database");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get("id");
    const id = Number(idParam);
    if (!idParam || Number.isNaN(id)) {
      return NextResponse.json({ error: "Valid deal ID is required" }, { status: 400 });
    }

    assertSupabaseConfigured();
    const deleted = await deleteSupabaseDeal(id);
    if (!deleted) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: `Deal ${id} deleted successfully` });
  } catch (error) {
    console.error("Failed to delete deal:", error);
    return supabaseErrorResponse(error, "Could not delete deal");
  }
}
