import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DishDetails } from "@/components/dish-details";
import { JsonLd } from "@/components/json-ld";
import { getDishesSafely } from "@/lib/data";
import { dishStructuredData, getSiteUrl, SITE_NAME } from "@/lib/seo";

export const dynamic = "force-dynamic";

type DishPageProps = { params: Promise<{ id: string }> };

async function findDish(id: string) {
  const dishId = Number(id);
  if (!Number.isSafeInteger(dishId) || dishId <= 0) return null;
  const dishes = await getDishesSafely();
  return dishes?.find((dish) => dish.id === dishId) || null;
}

export async function generateMetadata({ params }: DishPageProps): Promise<Metadata> {
  const { id } = await params;
  const dish = await findDish(id);
  if (!dish) return { title: `Dish not found | ${SITE_NAME}`, robots: { index: false, follow: false } };

  const title = `${dish.name} | ${SITE_NAME}`;
  const description = (dish.description || `View ${dish.name}, a homemade dish from ${SITE_NAME} in Bahawalpur.`).slice(0, 160);
  const url = `${getSiteUrl()}/dish/${dish.id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title,
      description,
      url,
      ...(dish.imageUrl ? { images: [{ url: dish.imageUrl, alt: dish.name }] } : {}),
    },
    twitter: { card: dish.imageUrl ? "summary_large_image" : "summary", title, description },
  };
}

export default async function DishPage({ params }: DishPageProps) {
  const { id } = await params;
  const dish = await findDish(id);
  if (!dish) notFound();

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: getSiteUrl() },
      { "@type": "ListItem", position: 2, name: "Menu", item: `${getSiteUrl()}/menu` },
      { "@type": "ListItem", position: 3, name: dish.name, item: `${getSiteUrl()}/dish/${dish.id}` },
    ],
  };

  return (
    <main className="page-shell">
      <JsonLd data={dishStructuredData(dish)} />
      <JsonLd data={breadcrumb} />
      <DishDetails dish={dish} />
    </main>
  );
}
