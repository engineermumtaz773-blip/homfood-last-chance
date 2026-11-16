"use client";

import { useSiteSettings } from "@/components/site-settings";

export function LocalizedPageHero({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  const { t } = useSiteSettings();
  return <section className="page-hero"><span className="section-kicker">{t(eyebrow)}</span><h1>{t(title)}</h1><p>{t(description)}</p></section>;
}
