import { Suspense } from "react";
import { LoadingScreen } from "@/components/loading-screen";
import { NativeMobileHome } from "@/components/native-mobile-home";
import { getDishes } from "@/lib/data";

export const dynamic = "force-dynamic";

async function MobileContent() {
  const dishes = await getDishes();
  return <NativeMobileHome dishes={dishes} />;
}

export default function AppMobilePage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <MobileContent />
    </Suspense>
  );
}
