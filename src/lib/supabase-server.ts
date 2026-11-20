import type { DbCustomer, DbOrder, DbOrderItem, DbOrderStatus, Deal, StoreSettings } from "@/lib/store-db";
import type { Dish } from "@/lib/data";
import { isSupabaseSchemaMismatch } from "@/lib/supabase-schema";

type SupabaseRow = Record<string, unknown>;

const menuItemRequiredColumns = [
  "id",
  "name",
  "description",
  "category",
  "categories",
  "image",
  "image_url",
  "portions",
  "available",
  "featured",
  "sold_out",
  "daily_stock_limit",
  "remaining_stock",
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "allergens",
  "addons_json",
  "updated_at",
  "deleted_at",
] as const;

const menuItemSelectColumns = [
  ...menuItemRequiredColumns,
  "serving_size",
  "dietary_tags",
  "rating",
  "rating_count",
  "translations",
].join(",");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && serviceRoleKey);

export function assertSupabaseConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase persistence is required. Configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
}

export type SupabaseErrorPayload = {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
  status?: number;
};

export function getSupabaseErrorPayload(error: unknown): SupabaseErrorPayload {
  if (error && typeof error === "object") {
    const candidate = error as Partial<SupabaseErrorPayload>;
    if (typeof candidate.message === "string") {
      return {
        message: candidate.message,
        ...(typeof candidate.details === "string" ? { details: candidate.details } : {}),
        ...(typeof candidate.hint === "string" ? { hint: candidate.hint } : {}),
        ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
        ...(typeof candidate.status === "number" ? { status: candidate.status } : {}),
      };
    }
  }
  return { message: error instanceof Error ? error.message : "Unknown Supabase error." };
}

function value(row: SupabaseRow, ...keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

function stringValue(row: SupabaseRow, ...keys: string[]) {
  const result = value(row, ...keys);
  return typeof result === "string" ? result : undefined;
}

function numberValue(row: SupabaseRow, ...keys: string[]) {
  const result = value(row, ...keys);
  return typeof result === "number" ? result : typeof result === "string" ? Number(result) : undefined;
}

function booleanValue(row: SupabaseRow, ...keys: string[]) {
  const result = value(row, ...keys);
  return typeof result === "boolean" ? result : result === "true";
}

function stringArrayValue(row: SupabaseRow, ...keys: string[]) {
  const items = value(row, ...keys);
  if (!Array.isArray(items)) return undefined;
  return items.flatMap((item): string[] => {
    if (typeof item === "string") return [item];
    if (item && typeof item === "object" && "name" in item && typeof item.name === "string") return [item.name];
    return [];
  });
}

function mapDish(row: SupabaseRow): Dish {
  const storedPortions = Array.isArray(value(row, "portions")) ? value(row, "portions") as Dish["portions"] : [];
  const portions = storedPortions.length > 0
    ? storedPortions
    : [{ name: "Full Plate", price: numberValue(row, "price_from", "price") || 0 }];
  const availability = value(row, "available", "is_available");
  const storedNutrition = value(row, "nutrition");
  const nutrition = storedNutrition && typeof storedNutrition === "object"
    ? storedNutrition as Dish["nutrition"]
    : [value(row, "calories"), value(row, "protein_g"), value(row, "carbs_g"), value(row, "fat_g")].some((item) => item !== undefined && item !== null)
      ? {
          calories: numberValue(row, "calories"),
          proteinGrams: numberValue(row, "protein_g"),
          carbsGrams: numberValue(row, "carbs_g"),
          fatGrams: numberValue(row, "fat_g"),
        }
      : undefined;
  const addons = value(row, "addons", "addons_json");
  return {
    id: numberValue(row, "id") || 0,
    name: stringValue(row, "name") || "Dish",
    description: stringValue(row, "description") || "",
    category: stringValue(row, "category") || "Dinner",
    categories: stringArrayValue(row, "categories"),
    image: stringValue(row, "image") || "🍲",
    imageUrl: stringValue(row, "imageUrl", "image_url"),
    portions,
    servingSize: stringValue(row, "servingSize", "serving_size"),
    dietaryTags: Array.isArray(value(row, "dietaryTags", "dietary_tags")) ? value(row, "dietaryTags", "dietary_tags") as string[] : [],
    allergens: Array.isArray(value(row, "allergens")) ? value(row, "allergens") as string[] : [],
    nutrition,
    dailyStockLimit: numberValue(row, "dailyStockLimit", "daily_stock_limit") ?? null,
    remainingStock: numberValue(row, "remainingStock", "remaining_stock") ?? null,
    addons: Array.isArray(addons) ? addons : [],
    spiceLevel: stringValue(row, "spiceLevel", "spice_level") as Dish["spiceLevel"],
    rating: numberValue(row, "rating"),
    ratingCount: numberValue(row, "ratingCount", "rating_count"),
    available: availability === undefined ? true : booleanValue(row, "available", "is_available"),
    featured: booleanValue(row, "featured"),
    soldOut: booleanValue(row, "soldOut", "sold_out"),
    translations: value(row, "translations") as Dish["translations"] | undefined,
  };
}

function mapDeal(row: SupabaseRow): Deal {
  return {
    id: numberValue(row, "id") || 0,
    title: stringValue(row, "title") || "Daily Deal",
    description: stringValue(row, "description") || "",
    regularPrice: numberValue(row, "regularPrice", "regular_price") || 0,
    discountedPrice: numberValue(row, "discountedPrice", "discounted_price") || 0,
    imageUrl: stringValue(row, "imageUrl", "image_url") || "",
    available: booleanValue(row, "available"),
  };
}

function mapCustomer(row: SupabaseRow): DbCustomer {
  return {
    id: stringValue(row, "id") || crypto.randomUUID(),
    name: stringValue(row, "name") || "Customer",
    email: stringValue(row, "email") || "",
    phone: stringValue(row, "phone"),
    avatarUrl: stringValue(row, "avatarUrl", "avatar_url"),
    authProvider: (stringValue(row, "authProvider", "auth_provider") || "email") as DbCustomer["authProvider"],
    emailVerified: booleanValue(row, "emailVerified", "email_verified"),
    createdAt: stringValue(row, "createdAt", "created_at") || new Date().toISOString(),
    lastLoginAt: stringValue(row, "lastLoginAt", "last_login_at"),
    addresses: Array.isArray(value(row, "addresses")) ? value(row, "addresses") as string[] : [],
    notes: stringValue(row, "notes"),
    favoriteDishIds: Array.isArray(value(row, "favorite_dish_ids"))
      ? (value(row, "favorite_dish_ids") as unknown[]).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
      : [],
  };
}

function mapOrder(row: SupabaseRow): DbOrder {
  const items = Array.isArray(value(row, "items")) ? value(row, "items") as DbOrderItem[] : [];
  return {
    id: stringValue(row, "id") || stringValue(row, "number") || crypto.randomUUID(),
    number: stringValue(row, "number", "order_number") || "",
    customerName: stringValue(row, "customerName", "customer_name") || "Customer",
    customerEmail: stringValue(row, "customerEmail", "customer_email"),
    customerPhone: stringValue(row, "customerPhone", "customer_phone") || "",
    area: stringValue(row, "area") || "Bahawalpur",
    address: stringValue(row, "address", "delivery_address") || "",
    notes: stringValue(row, "notes"),
    paymentMethod: stringValue(row, "paymentMethod", "payment_method") || "Cash on Delivery",
    items,
    subtotal: numberValue(row, "subtotal") || 0,
    discount: numberValue(row, "discount", "discount_amount") || 0,
    deliveryFee: numberValue(row, "deliveryFee", "delivery_fee") || 0,
    total: numberValue(row, "total", "total_amount") || 0,
    status: (stringValue(row, "status") || "pending") as DbOrderStatus,
    paymentStatus: (stringValue(row, "payment_status") || "pending") as DbOrder["paymentStatus"],
    paymentSlipUrl: stringValue(row, "payment_slip_url"),
    paymentSlipName: stringValue(row, "payment_slip_name"),
    customerNote: stringValue(row, "customer_note"),
    adminNotes: stringValue(row, "admin_note", "admin_notes"),
    adminMediaUrl: stringValue(row, "admin_video_url", "admin_media_url"),
    cancellationReason: stringValue(row, "cancellation_reason"),
    deletedAt: stringValue(row, "deleted_at"),
    createdAt: stringValue(row, "createdAt", "created_at") || new Date().toISOString(),
    updatedAt: stringValue(row, "updatedAt", "updated_at") || new Date().toISOString(),
    riderName: stringValue(row, "riderName", "rider_name"),
    riderPhone: stringValue(row, "riderPhone", "rider_phone"),
    estimatedDelivery: stringValue(row, "estimatedDelivery", "estimated_delivery"),
  };
}

async function request(path: string, init?: RequestInit): Promise<SupabaseRow[] | SupabaseRow> {
  assertSupabaseConfigured();
  const url = supabaseUrl;
  const key = serviceRoleKey;
  if (!url || !key) throw new Error("Supabase configuration is unavailable.");
  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/${path}`, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(10_000),
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
    const responseText = await response.text();
    let responseBody: unknown = null;
    let invalidJson = false;
    try {
      responseBody = responseText ? JSON.parse(responseText) : null;
    } catch {
      invalidJson = true;
    }
    if (!response.ok) {
      const body = !invalidJson && responseBody && typeof responseBody === "object"
        ? responseBody as Record<string, unknown>
        : {};
      const error = new Error(
        typeof body.message === "string"
          ? body.message
          : `Supabase request failed (${response.status}).`
      ) as Error & SupabaseErrorPayload;
      error.status = response.status;
      if (typeof body.details === "string") error.details = body.details;
      if (typeof body.hint === "string") error.hint = body.hint;
      if (typeof body.code === "string") error.code = body.code;
      throw error;
    }
    if (invalidJson) throw new Error("Supabase returned invalid JSON for a successful request.");
    if (!responseText && response.status !== 204) throw new Error("Supabase returned an empty response for a successful request.");
    return (responseBody || []) as SupabaseRow[] | SupabaseRow;
  } catch (error) {
    const method = (init?.method || "GET").toUpperCase();
    const table = path.split("?")[0];
    if (isSupabaseSchemaMismatch(error)) {
      console.error("[SUPABASE_SCHEMA_MISMATCH]", { table, method, error: getSupabaseErrorPayload(error) });
      const diagnostic = getSupabaseErrorPayload(error);
      const detail = [diagnostic.message, diagnostic.details, diagnostic.hint]
        .filter((part): part is string => Boolean(part))
        .join(" ");
      throw new Error(`Supabase schema is incomplete for ${table}. ${detail} Apply the required database migrations and retry.`);
    }
    console.error("[SUPABASE_REQUEST_FAILED]", { table, method, error: getSupabaseErrorPayload(error) });
    throw error;
  }
}

function rowsOf(result: SupabaseRow[] | SupabaseRow, operation: string): SupabaseRow[] {
  if (!Array.isArray(result)) throw new Error(`${operation} returned an unexpected Supabase response.`);
  return result;
}

function firstRow(result: SupabaseRow[] | SupabaseRow, operation: string): SupabaseRow {
  const rows = rowsOf(result, operation);
  if (!rows[0]) throw new Error(`${operation} did not return the saved Supabase row.`);
  return rows[0];
}

export async function getSupabaseCategories() {
  const rows = rowsOf(await request("categories?select=name&order=name.asc"), "Categories query");
  return rows.flatMap((row) => typeof row.name === "string" ? [row.name] : []);
}

export async function upsertSupabaseCategory(name: string, oldName?: string) {
  if (oldName && oldName !== name) await request(`categories?name=eq.${encodeURIComponent(oldName)}`, { method: "PATCH", body: JSON.stringify({ name }) });
  else await request("categories?on_conflict=name", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ name }),
  });
  return getSupabaseCategories();
}

export async function deleteSupabaseCategory(name: string) {
  await request(`categories?name=eq.${encodeURIComponent(name)}`, { method: "DELETE" });
  return getSupabaseCategories();
}

export async function getSupabaseOrders() {
  return rowsOf(await request("orders?select=*&deleted_at=is.null&order=created_at.desc"), "Orders query").map(mapOrder);
}

export async function getSupabaseOrder(number: string, phone?: string) {
  const normalized = number.trim().toUpperCase().replace(/^#/, "");
  if (!normalized || !/^[A-Z0-9-]+$/.test(normalized)) return null;
  const filters = [`number.ilike.${normalized}`, `number.ilike.#${normalized}`];
  if (/^[A-F0-9-]{36}$/.test(normalized) || /^\d+$/.test(normalized)) filters.push(`id.eq.${normalized.toLowerCase()}`);
  const query = new URLSearchParams({ select: "*", or: `(${filters.join(",")})`, deleted_at: "is.null" });
  const rows = rowsOf(await request(`orders?${query.toString()}`), "Order query");
  const orders = rows.map(mapOrder);
  return orders.find((order) => {
    if (!phone) return true;
    const expected = order.customerPhone.replace(/\D/g, "");
    const supplied = phone.replace(/\D/g, "");
    return expected.length >= 10 && supplied.length >= 10 && expected.slice(-10) === supplied.slice(-10);
  }) || null;
}

export async function getSupabaseOrdersForPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return [];
  const query = new URLSearchParams({
    select: "*",
    customer_phone: `ilike.*${digits.slice(-10)}`,
    deleted_at: "is.null",
    order: "created_at.desc",
    limit: "10",
  });
  return rowsOf(await request(`orders?${query.toString()}`), "Customer order query")
    .map(mapOrder)
    .filter((order) => {
      const stored = order.customerPhone.replace(/\D/g, "");
      return stored.length >= 10 && stored.slice(-10) === digits.slice(-10);
    });
}

export async function cancelSupabaseOrder(number: string, phone: string, reason: string) {
  const result = await request("rpc/cancel_homefood_order", {
    method: "POST",
    body: JSON.stringify({
      p_order_number: number,
      p_phone: phone,
      p_reason: reason,
    }),
  });
  const row = rowsOf(result, "Order cancellation")[0];
  if (!row || !["cancelled", "expired", "locked", "not_found"].includes(String(row.result))) {
    throw new Error("Order cancellation returned an unexpected Supabase response.");
  }
  const orderData = row.order_data;
  return {
    result: row.result,
    ...(orderData && typeof orderData === "object" ? { order: mapOrder(orderData as SupabaseRow) } : {}),
  } as {
    result: "cancelled" | "expired" | "locked" | "not_found";
    order?: DbOrder;
  };
}

export async function insertSupabaseOrder(order: DbOrder) {
  const saved = firstRow(await request("orders", {
    method: "POST",
    body: JSON.stringify({
      id: order.id,
      number: order.number,
      customer_name: order.customerName,
      customer_email: order.customerEmail,
      customer_phone: order.customerPhone,
      area: order.area,
      address: order.address,
      notes: order.notes,
      payment_method: order.paymentMethod,
      items: order.items,
      subtotal: order.subtotal,
      discount: order.discount,
      delivery_fee: order.deliveryFee,
      total: order.total,
      status: order.status,
      payment_status: order.paymentStatus,
      payment_slip_url: order.paymentSlipUrl,
      payment_slip_name: order.paymentSlipName,
      customer_note: order.customerNote,
      admin_note: order.adminNotes,
      admin_video_url: order.adminMediaUrl,
      admin_notes: order.adminNotes,
      admin_media_url: order.adminMediaUrl,
      rider_name: order.riderName,
      rider_phone: order.riderPhone,
      estimated_delivery: order.estimatedDelivery,
      created_at: order.createdAt,
      updated_at: order.updatedAt,
    }),
  }), "Order insert");
  return mapOrder(saved);
}

export async function updateSupabaseOrder(number: string, status: DbOrderStatus, details?: {
  riderName?: string;
  riderPhone?: string;
  estimatedDelivery?: string;
  notes?: string;
  paymentStatus?: DbOrder["paymentStatus"];
  paymentSlipUrl?: string;
  paymentSlipName?: string;
  customerNote?: string;
  adminNotes?: string;
  adminMediaUrl?: string;
}) {
  const rows = rowsOf(await request(`orders?number=eq.${encodeURIComponent(number)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      ...(details?.riderName ? { rider_name: details.riderName } : {}),
      ...(details?.riderPhone ? { rider_phone: details.riderPhone } : {}),
      ...(details?.estimatedDelivery ? { estimated_delivery: details.estimatedDelivery } : {}),
      ...(details?.notes ? { notes: details.notes } : {}),
      ...(details?.paymentStatus ? { payment_status: details.paymentStatus } : {}),
      ...(details?.paymentSlipUrl !== undefined ? { payment_slip_url: details.paymentSlipUrl } : {}),
      ...(details?.paymentSlipName !== undefined ? { payment_slip_name: details.paymentSlipName } : {}),
      ...(details?.customerNote !== undefined ? { customer_note: details.customerNote } : {}),
      ...(details?.adminNotes !== undefined ? { admin_note: details.adminNotes } : {}),
      ...(details?.adminMediaUrl !== undefined ? { admin_video_url: details.adminMediaUrl } : {}),
      ...(details?.adminNotes !== undefined ? { admin_notes: details.adminNotes } : {}),
      ...(details?.adminMediaUrl !== undefined ? { admin_media_url: details.adminMediaUrl } : {}),
      updated_at: new Date().toISOString(),
    }),
  }), "Order update");
  return rows[0] ? mapOrder(rows[0]) : null;
}

export async function deleteSupabaseOrder(number: string) {
  await request(`orders?number=eq.${encodeURIComponent(number)}`, { method: "DELETE" });
  return true;
}

function matchesDishCategory(dish: Dish, category: string) {
  const normalizedCategory = category.trim().toLocaleLowerCase();
  return [dish.category, ...(dish.categories || [])]
    .some((item) => item.trim().toLocaleLowerCase() === normalizedCategory);
}

export async function getSupabaseDishes(category?: string) {
  const rows = rowsOf(await request(`menu_items?select=${menuItemSelectColumns}&deleted_at=is.null&order=id.asc`), "Menu query");
  const invalidRows = rows.flatMap((row, index) => {
    const missing = menuItemRequiredColumns.filter((column) => !(column in row));
    return missing.length ? [`row ${index + 1}: ${missing.join(", ")}`] : [];
  });
  if (invalidRows.length) {
    throw new Error(`Supabase menu_items response is missing required columns (${invalidRows.join("; ")}). Apply the required database migrations and retry.`);
  }
  const dishes = rows
    .filter((row) => value(row, "deleted_at") == null)
    .map(mapDish);
  if (!category?.trim() || category.trim().toLocaleLowerCase() === "all") return dishes;
  return dishes.filter((dish) => matchesDishCategory(dish, category));
}

export async function upsertSupabaseDish(dish: Partial<Dish> & { name: string; category: string; portions: Dish["portions"] }) {
  const row = {
    ...(typeof dish.id === "number" ? { id: dish.id } : {}),
    name: dish.name,
    description: dish.description || "",
    category: dish.category,
    categories: dish.categories || [dish.category],
    image: dish.image || "🍲",
    image_url: dish.imageUrl || "",
    portions: dish.portions,
    serving_size: dish.servingSize,
    dietary_tags: dish.dietaryTags || [],
    rating: dish.rating ?? 4.8,
    rating_count: dish.ratingCount ?? 1,
    available: dish.available ?? true,
    featured: dish.featured ?? false,
    sold_out: dish.soldOut ?? false,
    translations: dish.translations || {},
    ...(dish.dailyStockLimit !== undefined ? { daily_stock_limit: dish.dailyStockLimit } : {}),
    ...(dish.remainingStock !== undefined ? { remaining_stock: dish.remainingStock } : {}),
    ...(dish.nutrition?.calories !== undefined ? { calories: dish.nutrition.calories } : {}),
    ...(dish.nutrition?.proteinGrams !== undefined ? { protein_g: dish.nutrition.proteinGrams } : {}),
    ...(dish.nutrition?.carbsGrams !== undefined ? { carbs_g: dish.nutrition.carbsGrams } : {}),
    ...(dish.nutrition?.fatGrams !== undefined ? { fat_g: dish.nutrition.fatGrams } : {}),
    ...(dish.allergens !== undefined ? { allergens: dish.allergens } : {}),
    ...(dish.addons !== undefined ? { addons_json: dish.addons } : {}),
    updated_at: new Date().toISOString(),
  };
  const saved = firstRow(await request("menu_items?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row),
  }), "Menu item upsert");
  return mapDish(saved);
}

export async function deleteSupabaseDish(id: number) {
  await request(`menu_items?id=eq.${id}`, { method: "DELETE" });
  return true;
}

export async function setSupabaseDishAvailability(id: number, available: boolean) {
  const rows = await request(`menu_items?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ available, sold_out: !available }),
  });
  return Array.isArray(rows) && rows[0] ? mapDish(rows[0]) : null;
}

export async function getSupabaseDeals() {
  return rowsOf(await request("daily_deals?select=*&order=id.asc"), "Deals query").map(mapDeal);
}

export async function upsertSupabaseDeal(deal: Partial<Deal> & { title: string; regularPrice: number; discountedPrice: number }) {
  const row = {
    ...(typeof deal.id === "number" ? { id: deal.id } : {}),
    title: deal.title,
    description: deal.description || "",
    regular_price: deal.regularPrice,
    discounted_price: deal.discountedPrice,
    image_url: deal.imageUrl || "",
    available: deal.available ?? true,
  };
  const saved = firstRow(await request("daily_deals?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row),
  }), "Deal upsert");
  return mapDeal(saved);
}

export async function deleteSupabaseDeal(id: number) {
  await request(`daily_deals?id=eq.${id}`, { method: "DELETE" });
  return true;
}

export async function getSupabaseSettings(): Promise<StoreSettings | null> {
  const rows = rowsOf(await request("store_settings?id=eq.singleton&select=*"), "Store settings query");
  if (!rows[0]) return null;
  const data = value(rows[0], "data");
  if (!data || typeof data !== "object") throw new Error("Supabase store settings row has no valid data document.");
  const stored = data as StoreSettings;
  const holidayMode = value(rows[0], "is_holiday_mode");
  const kitchenClosed = value(rows[0], "is_kitchen_closed");
  const holidayMessage = value(rows[0], "holiday_message");
  const weeklyHours = value(rows[0], "weekly_hours");
  const mealSlots = value(rows[0], "meal_slots");
  return {
    ...stored,
    restaurant: {
      ...stored.restaurant,
      ...(typeof kitchenClosed === "boolean" ? { isOpen: !kitchenClosed } : {}),
    },
    businessHours: {
      ...stored.businessHours,
      ...(typeof holidayMode === "boolean" ? { holidayMode } : {}),
      ...(typeof holidayMessage === "string" ? { holidayMessage } : {}),
      ...(weeklyHours && typeof weeklyHours === "object" ? { schedule: weeklyHours as StoreSettings["businessHours"]["schedule"] } : {}),
      ...(Array.isArray(mealSlots) ? { mealSlots: mealSlots as StoreSettings["businessHours"]["mealSlots"] } : {}),
    },
  };
}

export async function upsertSupabaseSettings(settings: StoreSettings) {
  const saved = firstRow(await request("store_settings?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      id: "singleton",
      data: settings,
      is_holiday_mode: settings.businessHours.holidayMode,
      holiday_message: settings.businessHours.holidayMessage,
      is_kitchen_closed: !settings.restaurant.isOpen,
      weekly_hours: settings.businessHours.schedule,
      meal_slots: settings.businessHours.mealSlots,
      updated_at: new Date().toISOString(),
    }),
  }), "Store settings upsert");
  const data = value(saved, "data");
  if (!data || typeof data !== "object") throw new Error("Supabase did not return the saved store settings.");
  return data as StoreSettings;
}

export async function getSupabaseCustomers() {
  return rowsOf(await request("customers?select=*&order=created_at.desc"), "Customers query").map(mapCustomer);
}

export async function getSupabaseCustomerByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const rows = rowsOf(await request(`customers?email=eq.${encodeURIComponent(normalizedEmail)}&select=*&limit=1`), "Customer lookup");
  return rows[0] ? mapCustomer(rows[0]) : null;
}

/** Checks Auth users through the server-only Supabase Auth Admin API. */
export async function supabaseAuthUserExists(email: string): Promise<boolean> {
  assertSupabaseConfigured();
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return false;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase Auth lookup configuration is unavailable.");

  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    try {
      const response = await fetch(
        `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!response.ok) {
        throw new Error(`Supabase Auth user lookup failed (${response.status}).`);
      }
      const payload = await response.json() as { users?: Array<{ email?: string | null }> };
      const users = Array.isArray(payload.users) ? payload.users : [];
      if (users.some((user) => user.email?.trim().toLowerCase() === normalizedEmail)) return true;
      if (users.length < perPage) return false;
    } catch (error) {
      console.error("[SUPABASE_AUTH_USER_LOOKUP_FAILED]", error);
      throw error;
    }
  }
}

export async function upsertSupabaseCustomer(customer: Partial<DbCustomer> & { email: string; authUserId?: string }) {
  // The setup schema has no database-side ID default. Reuse an existing ID
  // when the email already exists, otherwise provide one before the upsert.
  const existing = customer.id ? null : await getSupabaseCustomerByEmail(customer.email);
  const row = {
    id: customer.id || existing?.id || crypto.randomUUID(),
    name: customer.name || "Customer",
    email: customer.email.trim().toLowerCase(),
    phone: customer.phone || "",
    avatar_url: customer.avatarUrl || "",
    auth_provider: customer.authProvider || "email",
    email_verified: customer.emailVerified ?? true,
    addresses: customer.addresses || [],
    notes: customer.notes || "",
    last_login_at: new Date().toISOString(),
    ...(customer.authUserId ? { auth_user_id: customer.authUserId } : {}),
  };
  const saved = firstRow(await request("customers?on_conflict=email", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row),
  }), "Customer upsert");
  return mapCustomer(saved);
}

export async function upsertSupabaseAuthProfile(profile: {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  metadata?: Record<string, unknown>;
}) {
  const updatedAt = new Date().toISOString();
  const saved = firstRow(await request("profiles?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      id: profile.id,
      email: profile.email.trim().toLowerCase(),
      full_name: profile.name,
      avatar_url: profile.avatarUrl || "",
      metadata: profile.metadata || {},
      updated_at: updatedAt,
    }),
  }), "Auth profile upsert");
  return saved;
}

export async function upsertSupabasePhoneCustomer(customer: {
  id: string;
  name: string;
  phone: string;
  avatarUrl?: string;
  addresses?: string[];
  notes?: string;
}) {
  const updatedAt = new Date().toISOString();
  const customerRow = {
    id: customer.id,
    auth_user_id: customer.id,
    name: customer.name,
    email: null,
    phone: customer.phone,
    avatar_url: customer.avatarUrl || "",
    auth_provider: "phone",
    email_verified: false,
    addresses: customer.addresses || [],
    notes: customer.notes || "",
    last_login_at: updatedAt,
    updated_at: updatedAt,
  };
  const customers = await request("customers?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(customerRow),
  });
  if (!Array.isArray(customers) || !customers[0]) {
    throw new Error("Supabase did not return the saved phone customer record.");
  }
  await request(`profiles?id=eq.${encodeURIComponent(customer.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      full_name: customer.name,
      phone: customer.phone,
      avatar_url: customer.avatarUrl || "",
      phone_verified: true,
      updated_at: updatedAt,
    }),
  });
  return mapCustomer(customers[0]);
}

export async function deleteSupabaseCustomer(id: string) {
  await request(`customers?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  return true;
}

export async function getSupabaseCustomerFavorites(customerId: string) {
  const rows = rowsOf(await request(`customers?id=eq.${encodeURIComponent(customerId)}&select=favorite_dish_ids`), "Customer favorites query");
  if (!rows[0]) return null;
  const ids = value(rows[0], "favorite_dish_ids");
  return Array.isArray(ids) ? ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0) : [];
}

export async function updateSupabaseCustomerFavorites(customerId: string, ids: number[]) {
  const favorites = [...new Set(ids)].filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, 100);
  const rows = rowsOf(await request(`customers?id=eq.${encodeURIComponent(customerId)}&select=favorite_dish_ids`, {
    method: "PATCH",
    body: JSON.stringify({ favorite_dish_ids: favorites }),
  }), "Customer favorites update");
  if (!rows[0]) return null;
  const saved = value(rows[0], "favorite_dish_ids");
  return Array.isArray(saved) ? saved.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0) : [];
}

export async function getSupabaseDeliveryZones() {
  return rowsOf(await request("delivery_zones?select=id,zone_name,delivery_fee,min_order_amount,estimated_minutes&is_active=eq.true&deleted_at=is.null&order=zone_name.asc"), "Delivery zones query");
}

export async function validateSupabaseCoupon(code: string) {
  const rows = rowsOf(await request(`coupons?code=eq.${encodeURIComponent(code)}&is_active=eq.true&deleted_at=is.null&select=code,discount_type,discount_value,min_order_value,max_uses,used_count,expires_at&limit=1`), "Coupon query");
  return rows[0] || null;
}

export async function incrementSupabaseCouponUsage(code: string) {
  const rows = rowsOf(await request("rpc/redeem_coupon", {
    method: "POST",
    body: JSON.stringify({ p_code: code }),
  }), "Coupon redemption");
  if (rows[0]?.redeemed !== true) throw new Error("Coupon is no longer available.");
}

export async function getSupabaseCustomerSubscriptions(customerId: string) {
  return rowsOf(await request(`meal_subscriptions?customer_id=eq.${encodeURIComponent(customerId)}&select=*&order=created_at.desc`), "Customer subscriptions query");
}

export async function getSupabaseSubscriptions() {
  return rowsOf(await request("meal_subscriptions?select=*&order=created_at.desc"), "Meal subscriptions query");
}

export async function updateSupabaseSubscription(id: string, status: "active" | "paused" | "cancelled" | "completed") {
  const rows = rowsOf(await request(`meal_subscriptions?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  }), "Meal subscription update");
  return rows[0] || null;
}

export async function createSupabaseSubscription(input: {
  customerId: string;
  planType: "weekly" | "monthly";
  daysOfWeek: string[];
  mealSlot: "lunch" | "dinner";
  startDate: string;
  endDate?: string;
}) {
  return firstRow(await request("meal_subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer_id: input.customerId,
      plan_type: input.planType,
      days_of_week: input.daysOfWeek,
      meal_slot: input.mealSlot,
      start_date: input.startDate,
      end_date: input.endDate || null,
    }),
  }), "Meal subscription insert");
}

export async function createSupabaseReservation(input: {
  customerId?: string;
  guestName: string;
  phone: string;
  partySize: number;
  slotTime: string;
  notes: string;
}) {
  return firstRow(await request("reservations", {
    method: "POST",
    body: JSON.stringify({
      customer_id: input.customerId || null,
      guest_name: input.guestName,
      phone: input.phone,
      party_size: input.partySize,
      slot_time: input.slotTime,
      notes: input.notes,
    }),
  }), "Reservation insert");
}

export async function getSupabaseReservations() {
  return rowsOf(await request("reservations?select=*&order=slot_time.asc"), "Reservations query");
}

export async function getSupabaseCustomerReservations(customerId: string) {
  return rowsOf(await request(`reservations?customer_id=eq.${encodeURIComponent(customerId)}&select=*&order=slot_time.asc`), "Customer reservations query");
}

export async function updateSupabaseReservation(id: string, status: "confirmed" | "cancelled" | "completed") {
  const rows = rowsOf(await request(`reservations?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  }), "Reservation update");
  return rows[0] || null;
}

export async function getSupabaseCustomerReviews(customerId: string) {
  return rowsOf(await request(`reviews?customer_id=eq.${encodeURIComponent(customerId)}&select=*&order=created_at.desc`), "Customer reviews query");
}

export async function createSupabaseReview(input: {
  orderId: string;
  customerId?: string;
  menuItemId: number;
  rating: number;
  comment: string;
}) {
  return firstRow(await request("reviews", {
    method: "POST",
    body: JSON.stringify({
      order_id: input.orderId,
      customer_id: input.customerId || null,
      menu_item_id: input.menuItemId,
      rating: input.rating,
      comment: input.comment,
    }),
  }), "Review insert");
}

export async function getPublicSupabaseReviews() {
  return rowsOf(await request("reviews?select=rating,comment,created_at,menu_item_id&is_approved=eq.true&order=created_at.desc&limit=50"), "Public reviews query");
}

export type OrderMessage = {
  id: string;
  orderNumber: string;
  sender: "customer" | "admin";
  body: string;
  createdAt: string;
};

function mapMessage(row: SupabaseRow): OrderMessage {
  return {
    id: stringValue(row, "id") || crypto.randomUUID(),
    orderNumber: stringValue(row, "orderNumber", "order_number") || "",
    sender: stringValue(row, "sender", "sender_role") === "admin" ? "admin" : "customer",
    body: stringValue(row, "body", "message") || "",
    createdAt: stringValue(row, "createdAt", "created_at") || new Date().toISOString(),
  };
}

export async function getSupabaseMessages(orderNumber: string) {
  const rows = await request(`order_messages?order_number=eq.${encodeURIComponent(orderNumber)}&select=*&order=created_at.asc`);
  return Array.isArray(rows) ? rows.map(mapMessage) : [];
}

export async function insertSupabaseMessage(message: Omit<OrderMessage, "id" | "createdAt">) {
  const rows = await request("order_messages", {
    method: "POST",
    body: JSON.stringify({
      order_number: message.orderNumber,
      sender_role: message.sender,
      body: message.body,
    }),
  });
  return mapMessage(firstRow(rows, "Order message insert"));
}

export async function insertSupabaseNotification(input: {
  type: "order_created" | "order_cancelled" | "chat_message" | "profile_updated" | "order_status" | "customer_note" | "payment_proof" | "contact_request";
  title: string;
  body: string;
  orderNumber?: string;
  priority?: "normal" | "high";
}) {
  const rows = await request("admin_notifications", {
    method: "POST",
    body: JSON.stringify({
      type: input.type,
      title: input.title,
      body: input.body,
      order_number: input.orderNumber,
      priority: input.priority || "normal",
      read: false,
    }),
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function getSupabaseNotifications(unreadOnly = false) {
  const filter = unreadOnly ? "&read=eq.false" : "";
  return request(`admin_notifications?select=*&order=created_at.desc&limit=100${filter}`);
}
