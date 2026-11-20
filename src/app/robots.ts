import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: ["/", "/menu", "/daily-deals", "/about", "/help", "/contact"],
      disallow: ["/admin/", "/api/", "/checkout", "/profile", "/order-confirmation", "/track-order"],
    }],
    sitemap: new URL("/sitemap.xml", getSiteUrl()).toString(),
    host: getSiteUrl(),
  };
}
