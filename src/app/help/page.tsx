import type { Metadata } from "next";
import { HelpPageContent } from "@/app/help/help-content";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbStructuredData, buildPageMetadata, faqStructuredData } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Help & Frequently Asked Questions",
  description: "Answers about ordering, delivery zones, payments, tracking, and meal plans in Bahawalpur.",
  path: "/help",
});

const faq = [
  ["How do I place an order?", "Choose dishes from the menu, customize your portions, and submit your delivery details at checkout. The kitchen confirms the request before preparing it."],
  ["Which areas do you deliver to?", "Current delivery zones and fees are shown at checkout. If your neighborhood is not listed, contact the team before ordering."],
  ["How can I pay?", "Cash on delivery and the Raast payment option are available where enabled. A payment receipt is reviewed by the team before an order is marked paid."],
  ["How do I track an order?", "Use the order number and phone number from checkout on the Track Order page. Status updates appear as the order moves through the kitchen and delivery."],
  ["Can I change or cancel an order?", "Contact the kitchen as soon as possible. Changes depend on whether preparation has started."],
  ["How do subscriptions and reservations work?", "Submit a meal plan or table request through the relevant form. Requests are pending until the team confirms availability."],
];

export default function HelpPage() {
  return <>
    <JsonLd data={faqStructuredData(faq.map(([question, answer]) => ({ question, answer })))} />
    <JsonLd data={breadcrumbStructuredData([{ name: "Home", path: "/" }, { name: "Help & FAQ", path: "/help" }])} />
    <HelpPageContent />
  </>;
}
