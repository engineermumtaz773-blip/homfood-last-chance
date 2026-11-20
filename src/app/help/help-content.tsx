"use client";

import { useSiteSettings } from "@/components/site-settings";

const questions = [
  ["faqOrderQuestion", "faqOrderAnswer"],
  ["faqDeliveryQuestion", "faqDeliveryAnswer"],
  ["faqPaymentQuestion", "faqPaymentAnswer"],
  ["faqTrackingQuestion", "faqTrackingAnswer"],
  ["faqChangesQuestion", "faqChangesAnswer"],
  ["faqPlansQuestion", "faqPlansAnswer"],
] as const;

export function HelpPageContent() {
  const { t } = useSiteSettings();
  return <main className="feature-page">
    <p className="store-eyebrow">{t("helpEyebrow")}</p>
    <h1>{t("helpTitle")}</h1>
    <div className="faq-list">{questions.map(([question, answer]) => <details key={question}><summary>{t(question)}</summary><p>{t(answer)}</p></details>)}</div>
  </main>;
}
