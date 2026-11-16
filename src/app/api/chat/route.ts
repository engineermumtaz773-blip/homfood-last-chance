import type { Dish } from "@/lib/data";
import type { StoreSettings } from "@/lib/store-db";
import { assertSupabaseConfigured, getSupabaseDeals, getSupabaseDishes, getSupabaseSettings } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatTurn = { role: "user" | "assistant"; content: string };
type StoreContext = {
  dishes: Dish[];
  deals: Awaited<ReturnType<typeof getSupabaseDeals>>;
  settings: StoreSettings;
};

async function loadStoreContext(): Promise<StoreContext> {
  assertSupabaseConfigured();
  const [dishes, deals, settings] = await Promise.all([getSupabaseDishes(), getSupabaseDeals(), getSupabaseSettings()]);
  if (!settings) throw new Error("Store settings are not initialized in Supabase.");
  return { dishes, deals, settings };
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function readTurns(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-10).flatMap((turn): ChatTurn[] => {
    if (!turn || typeof turn !== "object") return [];
    const candidate = turn as Record<string, unknown>;
    if ((candidate.role !== "user" && candidate.role !== "assistant") || typeof candidate.text !== "string") return [];
    const content = candidate.text.trim().slice(0, 2000);
    return content ? [{ role: candidate.role, content }] : [];
  });
}

async function buildDualLayerSystemPrompt(locale: string): Promise<string> {
  const { dishes, deals, settings } = await loadStoreContext();
  const language =
    locale === "ur"
      ? "Urdu"
      : locale === "sd"
      ? "Sindhi"
      : locale === "ur-Latn"
      ? "Roman Urdu"
      : "English";

  const menuSummary = dishes.map((dish) => ({
    id: dish.id,
    name: dish.name,
    category: dish.category,
    description: dish.description,
    portions: dish.portions.map((p) => `${p.name}: PKR ${p.price}`).join(", "),
    dietary: dish.dietaryTags?.join(", ") || "Standard",
    available: dish.available !== false ? "In Stock" : "Sold Out",
  }));

  const dealsSummary = deals.map((deal) => ({
    id: deal.id,
    title: deal.title,
    description: deal.description,
    dealPrice: `PKR ${deal.discountedPrice}`,
    regularPrice: `PKR ${deal.regularPrice}`,
    savings: `Save PKR ${deal.regularPrice - deal.discountedPrice}`,
    available: deal.available !== false ? "Active" : "Inactive",
  }));

  return `You are the advanced AI Assistant for "Home Made Food" (HMF), a premier homemade culinary kitchen based in Bahawalpur, Pakistan.
Respond in ${language}, matching the customer's language and tone (Urdu, Roman Urdu, Sindhi, or English).

You operate with DUAL-LAYER CAPABILITIES:

=== LAYER 1: DYNAMIC LIVE STORE CATALOG & BAHAWALPUR OPERATIONS ===
Use the live real-time database context below for all restaurant, dish, pricing, delivery, and payment inquiries:
• STORE IDENTITY: "Home Made Food" — Authentic, fresh, homestyle meals cooked daily with premium ingredients in Bahawalpur.
• OWNER: Mumtaz Ali.
• LOCATION: Model Town & University Chowk, Bahawalpur, Pakistan.
• CUSTOMER CONTACT: +92 304 0537000 | engineermumtaz773@gmail.com.
• BAHAWALPUR DELIVERY AREAS: ${settings?.delivery.deliveryAreas.join(", ") || "Bahawalpur"}.
• DELIVERY TIMINGS & PREPARATION: Freshly cooked on order. Estimated kitchen preparation & delivery: ${settings?.delivery.estimatedDeliveryTime || "30-45 minutes"}.
• DELIVERY SLOTS: ${settings?.businessHours.slots.join(", ") || "Daily"}.
• REGULAR OPERATING HOURS: ${Object.entries(settings.businessHours.schedule || {}).map(([day, hours]) => `${day}: ${hours.enabled ? `${hours.open}–${hours.close}` : "closed"}`).join("; ") || "Check the live storefront"}.
• DYNAMIC MCB RAAST CHECKOUT QR CODE: On checkout (/checkout), customers can scan the dynamic EMVCo QR code encoding Merchant "MUMTAZ ALI", Reference "${settings?.payments.raastMerchantName || "9955"}", and the exact dynamic cart total in PKR. Cash on Delivery is also supported.
• CONTACT: WhatsApp: ${settings?.restaurant.whatsapp || "Available on website"} | Phone: ${settings?.restaurant.phone || "Available on website"}.
• ORDER TRACKING: Customers can track live orders at /track-order with their order number and phone.
• CURRENT ACTIVE DAILY DEALS (From Database):
${JSON.stringify(dealsSummary, null, 2)}
• LIVE DYNAMIC MENU & EXACT PKR PRICES (From Database):
${JSON.stringify(menuSummary, null, 2)}
Always quote prices accurately in Pakistani Rupees (PKR / Rs.) based strictly on the current catalog above. If an item is marked "Sold Out", politely inform the customer and suggest available alternatives.

=== LAYER 2: FULL WORLD-LEVEL GENERAL INTELLIGENCE ===
You are NOT restricted to restaurant queries. You possess comprehensive, world-class knowledge and intelligence across all domains:
• Science, technology, mathematics, programming, software engineering, history, philosophy, geography, and world culture.
• Culinary advice, cooking techniques, recipes, spice substitutions, and meal planning.
• Casual everyday conversation, friendly chat, problem-solving, and general advice.
Never say "I can only answer food questions" or refuse off-topic inquiries. Cheerfully and comprehensively answer any general question the user asks, while remaining polite, accurate, and helpful.`;
}

async function generateLocalFallbackStream(messages: ChatTurn[], locale: string): Promise<Response> {
  const lastUserQuery = (messages[messages.length - 1]?.content || "").toLowerCase();
  const { dishes, deals, settings } = await loadStoreContext();
  let localAnswer = "";

  if (lastUserQuery.includes("deal") || lastUserQuery.includes("offer") || lastUserQuery.includes("special")) {
    const activeDeals = deals
      .map((d) => `• **${d.title}**: PKR ${d.discountedPrice} (Regular: PKR ${d.regularPrice}) — ${d.description}`)
      .join("\n");
    localAnswer = activeDeals
      ? `Here are our current Daily Deals in Bahawalpur:\n\n${activeDeals}\n\nYou can order these directly from our Daily Deals page with fast delivery!`
      : "I can’t confirm a current deal right now. Please check the Daily Deals page for the latest offers.";
  } else if (
    lastUserQuery.includes("delivery") ||
    lastUserQuery.includes("area") ||
    lastUserQuery.includes("timing") ||
    lastUserQuery.includes("time")
  ) {
    localAnswer = `We deliver across Bahawalpur including: ${settings?.delivery.deliveryAreas.join(", ") || "Bahawalpur"}.\n\nPreparation and delivery takes approximately ${settings?.delivery.estimatedDeliveryTime || "30-45 minutes"} for fresh hot food.\n\nDelivery slots: ${settings?.businessHours.slots.join(", ") || "Daily"}.`;
  } else if (
    lastUserQuery.includes("payment") ||
    lastUserQuery.includes("raast") ||
    lastUserQuery.includes("mcb") ||
    lastUserQuery.includes("qr")
  ) {
    localAnswer = `We accept instant digital payments via MCB Raast Dynamic EMVCo QR code (Merchant: MUMTAZ ALI, Ref: 9955) on checkout with your exact cart total pre-encoded, as well as Cash on Delivery.`;
  } else if (
    lastUserQuery.includes("biryani") ||
    lastUserQuery.includes("menu") ||
    lastUserQuery.includes("price") ||
    lastUserQuery.includes("karahi") ||
    lastUserQuery.includes("pulao") ||
    lastUserQuery.includes("dish")
  ) {
    const sample = dishes
      .filter((d) => d.available !== false)
      .slice(0, 6)
      .map((d) => `• **${d.name}** (${d.category}): ${d.portions.map((p) => `${p.name} PKR ${p.price}`).join(", ")}`)
      .join("\n");
    localAnswer = `Here are some popular homestyle items from our live Bahawalpur menu:\n\n${sample}\n\nBrowse our full menu online to see all portions and fresh specials!`;
  } else if (lastUserQuery.includes("track") || lastUserQuery.includes("order")) {
    localAnswer = `You can track your order status in real time by visiting the Track Order page (/track-order) and entering your Order Reference (e.g. #HMF-101) and phone number.`;
  } else {
    localAnswer = `Welcome to Home Made Food Bahawalpur! Our kitchen prepares fresh, authentic homestyle meals cooked to order. We deliver across Bahawalpur with live order tracking and dynamic MCB Raast payment.\n\nHow can I help you today with our menu, daily deals, or food recommendations?`;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(localAnswer));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 120_000) return jsonError("Chat request is too large.", 413);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") return jsonError("Invalid chat request.", 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonError("Invalid chat request.", 400);
  }

  const messages = readTurns(body.messages);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return jsonError("A user message is required.", 400);
  }
  const locale = typeof body.locale === "string" && ["en", "ur", "sd", "ur-Latn"].includes(body.locale) ? body.locale : "en";
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();

  // If no Gemini API key is configured yet, stream an intelligent local assistant response
  if (!apiKey) {
    try { return await generateLocalFallbackStream(messages, locale); }
    catch (error) { console.error("Chat could not load live store data from Supabase.", error); return jsonError("Live store data is temporarily unavailable.", 503); }
  }

  let systemInstruction: string;
  try {
    systemInstruction = await buildDualLayerSystemPrompt(locale);
  } catch (error) {
    console.error("Could not build Gemini store context from Supabase.", error);
    return jsonError("Live store data is temporarily unavailable.", 503);
  }

  // Connect to Google Gemini API with fallback models
  const configuredModel = process.env.GEMINI_MODEL?.trim();
  const candidateModels = Array.from(
    new Set([
      configuredModel,
      "gemini-3.8-flash",
      "gemini-3.7-flash",
      "gemini-3.5-flash-lite",
      "gemini-2.5-flash",
    ])
  ).filter((m): m is string => Boolean(m && /^[A-Za-z0-9._-]{1,100}$/.test(m)));

  let upstream: Response | null = null;

  for (const model of candidateModels) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: messages.map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
          generationConfig: { maxOutputTokens: 900, temperature: 0.7 },
        }),
        cache: "no-store",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(18_000)]),
      });

      if (response.ok && response.body) {
        upstream = response;
        break;
      }
      console.warn(`Gemini attempt with model ${model} returned HTTP ${response.status}, trying next fallback...`);
    } catch (err) {
      if (request.signal.aborted) return new Response(null, { status: 499 });
      console.warn(`Gemini attempt with model ${model} failed, trying next fallback...`, err);
    }
  }

  // Gracefully fall back to local intelligent assistant if all upstream models fail
  if (!upstream || !upstream.ok || !upstream.body) {
    console.warn("All Gemini API models failed or API key quota exceeded, falling back to dynamic store intelligence.");
    return generateLocalFallbackStream(messages, locale);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream!.body!.getReader();
      let buffer = "";
      const emitSseData = (line: string) => {
        if (!line.startsWith("data:")) return;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") return;
        try {
          const chunk = JSON.parse(data) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
          const text = chunk.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
          if (text) controller.enqueue(encoder.encode(text));
        } catch { /* Ignore incomplete or non-content SSE frames */ }
      };
      try {
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";
          for (const line of lines) emitSseData(line);
          if (done) {
            emitSseData(buffer);
            break;
          }
        }
        controller.close();
      } catch (error) {
        console.error("Gemini response stream interrupted.", error instanceof Error ? error.message : "unknown error");
        try { controller.error(error); } catch { /* stream closed */ }
      } finally {
        reader.releaseLock();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
