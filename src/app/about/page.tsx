import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "About Home Made Food",
  description: "Learn about our fresh, thoughtful homemade cooking and Bahawalpur kitchen.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <>
      <section className="page-hero"><span className="section-kicker">Our Story</span><h1>A little taste of home</h1><p>Thoughtful everyday cooking, made fresh for our Bahawalpur community.</p></section>
      <section className="section"><div className="checkout-grid" style={{ maxWidth: 1050, alignItems: "center" }}><div><span className="section-kicker">From our kitchen</span><h2 style={{ fontSize: 40, fontWeight: 500 }}>Food made with the care we give our own family.</h2><p style={{ color: "var(--muted)", lineHeight: 1.8 }}>Home Made Food began with a simple idea: everyday meals should feel comforting, fresh and honest. We prepare our menu in small batches with familiar recipes and ingredients sourced each day.</p><p style={{ color: "var(--muted)", lineHeight: 1.8 }}>From the first ingredient to the moment your order arrives, we care about freshness, cleanliness and the little details that make a meal feel like home.</p></div><div className="hours-card"><span className="contact-icon">✿</span><h2>Our promise</h2><p>Clean kitchen. Fresh ingredients. Food prepared with care.</p></div></div></section>
      <section className="section" style={{ background: "#fbfaf8" }}><div className="section-heading"><span className="section-kicker">What matters to us</span><h2>Simple values, every day</h2></div><div className="feature-grid">{[["01","Freshness first","Ingredients selected and prepared fresh each day."],["02","Kitchen hygiene","Careful food handling and a clean preparation space."],["03","Honest cooking","Familiar recipes, thoughtfully prepared without shortcuts."],["04","Our community","Proud to serve neighbours across Bahawalpur."]].map(([number,title,copy])=><article className="feature-card" key={number}><span className="section-kicker">{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
    </>
  );
}
