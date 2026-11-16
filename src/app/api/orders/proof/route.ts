import { NextRequest } from "next/server";
import { POST as uploadSlip } from "../../upload-slip/route";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return uploadSlip(request);
}
