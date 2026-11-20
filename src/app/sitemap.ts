import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/menu`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/daily-deals`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/help`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/contact`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
