import { Suspense } from "react";
import { LoadingScreen } from "@/components/loading-screen";
import { NativeMobileHome } from "@/components/native-mobile-home";
import { MenuUnavailable } from "@/components/menu-unavailable";
import { getDishesSafely } from "@/lib/data";

export const dynamic = "force-dynamic";

async function MobileContent() {
  const dishes = await getDishesSafely();
  if (!dishes) return <MenuUnavailable />;
  return <NativeMobileHome dishes={dishes} />;
}

export default function AppMobilePage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <MobileContent />
    </Suspense>
  );
}
