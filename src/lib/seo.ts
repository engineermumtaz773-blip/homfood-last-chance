import type { Metadata } from "next";
import type { Dish } from "@/lib/data";

export const SITE_NAME = "Home Made Food";
export const SITE_DESCRIPTION = "Fresh homemade meals prepared daily and delivered across Bahawalpur.";

export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  try {
    const url = new URL(configured || "https://homefood.engineer");
    if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
      return "https://homefood.engineer";
    }
    return url.origin;
  } catch {
    return "https://homefood.engineer";
  }
}

export function buildPageMetadata(input: {
  title: string;
  description: string;
  path?: string;
}): Metadata {
  const url = getSiteUrl();
  const canonical = input.path ? new URL(input.path, url).toString() : url;
  return {
    title: input.title,
    description: input.description,
    ...(input.path ? { alternates: { canonical } } : {}),
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: input.title,
      description: input.description,
      ...(input.path ? { url: canonical } : {}),
      locale: "en_PK",
      images: [{ url: "/icons/app-icon-192.png", width: 192, height: 192, alt: SITE_NAME }],
    },
    twitter: {
      card: "summary",
      title: input.title,
      description: input.description,
      images: ["/icons/app-icon-192.png"],
    },
  };
}

export function restaurantStructuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: SITE_NAME,
    url: getSiteUrl(),
    image: new URL("/icons/app-icon-192.png", getSiteUrl()).toString(),
    description: SITE_DESCRIPTION,
    servesCuisine: ["Pakistani", "Homemade"],
    priceRange: "PKR",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Bahawalpur",
      addressCountry: "PK",
    },
    areaServed: { "@type": "City", name: "Bahawalpur" },
  };
}

export function menuStructuredData(dishes: Dish[]) {
  return {
    "@context": "https://schema.org",
    "@type": "Menu",
    name: `${SITE_NAME} Menu`,
    url: new URL("/menu", getSiteUrl()).toString(),
    hasMenuSection: [{
      "@type": "MenuSection",
      name: "Fresh homemade meals",
      hasMenuItem: dishes.map((dish) => ({
        "@type": "MenuItem",
        name: dish.name,
        description: dish.description,
        offers: dish.portions.map((portion) => ({
          "@type": "Offer",
          price: portion.price,
          priceCurrency: "PKR",
          availability: dish.available === false ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
        })),
      })),
    }],
  };
}

export function breadcrumbStructuredData(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: new URL(item.path, getSiteUrl()).toString(),
    })),
  };
}

export function faqStructuredData(items: Array<{ question: string; answer: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function serializeStructuredData(value: object) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
