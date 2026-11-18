import { Suspense } from "react";
import { LoadingScreen } from "@/components/loading-screen";
import { AdaptiveStorefront } from "@/components/adaptive-storefront";
import { MenuUnavailable } from "@/components/menu-unavailable";
import { getDishesSafely } from "@/lib/data";

export const dynamic = "force-dynamic";

async function HomeContent() {
  const dishes = await getDishesSafely();
  if (!dishes) return <MenuUnavailable />;
  return <AdaptiveStorefront dishes={dishes} />;
}

export default function Home() {
  return <Suspense fallback={<LoadingScreen />}><HomeContent /></Suspense>;
}
