import {
  GET as getMenu,
  POST as postMenu,
  PATCH as patchMenu,
  DELETE as deleteMenu,
} from "@/app/api/menu/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = getMenu;
export const POST = postMenu;
export const PATCH = patchMenu;
export const DELETE = deleteMenu;
