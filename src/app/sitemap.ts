import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo";
import { getDishesSafely } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const dishes = await getDishesSafely();
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/menu`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/daily-deals`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/subscriptions`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/reservations`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/help`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/contact`, changeFrequency: "monthly", priority: 0.5 },
    ...(dishes || []).map((dish) => ({
      url: `${base}/dish/${dish.id}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
      ...(dish.imageUrl ? { images: [dish.imageUrl] } : {}),
    })),
  ];
}
