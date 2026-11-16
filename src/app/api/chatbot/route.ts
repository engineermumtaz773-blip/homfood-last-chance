import { POST as chatPost } from "@/app/api/chat/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = chatPost;
