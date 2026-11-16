import { WhatsAppForm } from "@/components/whatsapp-form";

export default function ContactPage() {
  return (
    <>
      <section className="page-hero"><span className="section-kicker">Get In Touch</span><h1>We&apos;d love to hear from you</h1><p>Questions, a special request, or ready to order? We&apos;re happy to help.</p></section>
      <section className="section">
        <div className="contact-grid">
          <a className="contact-card" href="tel:03096648932"><span className="contact-icon">⌕</span><h3>Call Us</h3><p>03096648932</p></a>
          <a className="contact-card" href="mailto:ch.arslan4367@gmail.com"><span className="contact-icon">✉</span><h3>Email Us</h3><p>ch.arslan4367@gmail.com</p></a>
          <div className="contact-card"><span className="contact-icon">⌖</span><h3>Visit Us</h3><p>Goheer town, street no 2, university chowk, Bahawalpur, Pakistan</p></div>
        </div>
        <div style={{ marginTop: 40 }}><WhatsAppForm /></div>
      </section>
    </>
  );
}
