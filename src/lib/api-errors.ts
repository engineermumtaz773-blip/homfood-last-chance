import { NextResponse } from "next/server";
import { getSupabaseErrorPayload } from "@/lib/supabase-server";

export function supabaseErrorResponse(error: unknown, fallback: string, status = 500) {
  const details = getSupabaseErrorPayload(error);
  return NextResponse.json(
    {
      error: details.message || fallback,
      message: details.message || fallback,
      ...(details.details ? { details: details.details } : {}),
      ...(details.hint ? { hint: details.hint } : {}),
      ...(details.code ? { code: details.code } : {}),
    },
    { status }
  );
}
