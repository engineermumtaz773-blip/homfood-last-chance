import { Suspense } from "react";
import { LoadingScreen } from "@/components/loading-screen";
import { AdaptiveStorefront } from "@/components/adaptive-storefront";
import { getDishes } from "@/lib/data";

export const dynamic = "force-dynamic";

async function MenuContent() {
  const menu = await getDishes();
  return <AdaptiveStorefront dishes={menu} />;
}

export default function MenuPage() {
  return <Suspense fallback={<LoadingScreen />}><MenuContent /></Suspense>;
}
