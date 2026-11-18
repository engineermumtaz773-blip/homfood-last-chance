import Link from "next/link";
import Image from "next/image";
import { AppInstallActions } from "@/components/app-install-actions";

const brandImage = "/image_6c70d8.jpg";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-brand"><Link href="/" className="brand"><Image className="brand-mark" src={brandImage} width={52} height={52} alt="" unoptimized /><span>Home Made Food</span></Link><p>Tasty homemade food made with fresh, healthy ingredients. Prepared with care and delivered to your home in Bahawalpur.</p></div>
      <div className="footer-col"><h3>Quick Links</h3><Link href="/">Home</Link><Link href="/menu">Menu</Link><Link href="/track-order">Track Order</Link><Link href="/subscriptions">Meal plans</Link><Link href="/reservations">Reservations</Link><Link href="/help">Help & FAQ</Link><Link href="/profile">Your Profile</Link><Link href="/about">About</Link><Link href="/contact">Contact</Link></div>
      <div className="footer-col"><h3>Official links</h3><a href="https://web.facebook.com/" target="_blank" rel="noreferrer">Facebook</a><a href="https://instagram.com/" target="_blank" rel="noreferrer">Instagram</a><a href="https://engineer-mumtaz-portfolio.vercel.app/" target="_blank" rel="noreferrer">Mumtaz Ali portfolio</a><AppInstallActions /></div>
      <div className="footer-bottom">© 2026 Home Made Food. All rights reserved.</div>
    </footer>
  );
}
