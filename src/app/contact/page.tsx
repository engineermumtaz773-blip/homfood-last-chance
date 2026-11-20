import { WhatsAppForm } from "@/components/whatsapp-form";

const visitAddress = "Goheer town, street no 2, university chowk, Bahawalpur, Pakistan";
const visitMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visitAddress)}`;

export default function ContactPage() {
  return (
    <>
      <section className="page-hero"><span className="section-kicker">Get In Touch</span><h1>We&apos;d love to hear from you</h1><p>Questions, a special request, or ready to order? We&apos;re happy to help.</p></section>
      <section className="section">
        <div className="contact-grid">
          <a className="contact-card" href="tel:03096648932"><span className="contact-icon">⌕</span><h3>Call Us</h3><p>03096648932</p></a>
          <a className="contact-card" href="mailto:ch.arslan4367@gmail.com"><span className="contact-icon">✉</span><h3>Email Us</h3><p>ch.arslan4367@gmail.com</p></a>
          <a className="contact-card" href={visitMapUrl} target="_blank" rel="noreferrer"><span className="contact-icon">⌖</span><h3>Visit Us</h3><p>{visitAddress}</p><span className="contact-map-link">Open Google Maps ↗</span></a>
        </div>
        <div style={{ marginTop: 40 }}><WhatsAppForm /></div>
      </section>
    </>
  );
}
