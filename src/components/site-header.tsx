"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useMemo, useRef, useCallback } from "react";
import type { Dish } from "@/lib/data";
import type { FormEvent } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, MotionConfig, useScroll, useSpring } from "framer-motion";
import { useCart } from "@/components/cart-provider";
import { AppInstallActions } from "@/components/app-install-actions";
import { useSiteSettings, type Locale, type Theme } from "@/components/site-settings";
import { acquireScrollLock } from "@/lib/scroll-lock";
import { readCustomerProfile, CUSTOMER_AUTH_EVENT, type CustomerProfile } from "@/lib/customer";
import { matchesDishSearch } from "@/lib/menu-search";

const links = [["menu", "/menu"], ["deals", "/daily-deals"], ["track", "/track-order"]] as const;
const footerLinks = [
  ["Home", "/"],
  ["Menu", "/menu"],
  ["Track Order", "/track-order"],
  ["Meal plans", "/subscriptions"],
  ["Reservations", "/reservations"],
  ["Help & FAQ", "/help"],
  ["Your Profile", "/profile"],
  ["About", "/about"],
  ["Contact", "/contact"],
] as const;
const brandImage = "/image_6c70d8.jpg";

function ScrollFillProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 28, restDelta: 0.001 });
  return <motion.div className="scroll-fill-progress" style={{ scaleX }} aria-hidden="true" />;
}

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [deliveryArea, setDeliveryArea] = useState("Bahawalpur");
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [appViewOpen, setAppViewOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [currency, setCurrency] = useState("PKR");
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const pagesMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const appViewMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { items } = useCart();
  const { t, locale, theme, setLocale, setTheme, localeNames, themeNames } = useSiteSettings();
  const count = items.reduce((total, item) => total + item.quantity, 0);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [searchDishes, setSearchDishes] = useState<Dish[]>([]);

  const closeHeaderMenus = useCallback(() => {
    setSettingsOpen(false);
    setPagesOpen(false);
    setProfileOpen(false);
    setMenuOpen(false);
    setAppViewOpen(false);
  }, []);

  useEffect(() => {
    const restorePreferences = window.setTimeout(() => {
      setCustomer(readCustomerProfile());
      setSoundEnabled(localStorage.getItem("hmf_sound") !== "off");
      setCurrency(localStorage.getItem("hmf_currency") || "PKR");
    }, 0);
    const handler = (e: Event) => {
      const ce = e as CustomEvent<CustomerProfile | null>;
      setCustomer(ce.detail || null);
    };
    window.addEventListener(CUSTOMER_AUTH_EVENT, handler);
    return () => {
      window.clearTimeout(restorePreferences);
      window.removeEventListener(CUSTOMER_AUTH_EVENT, handler);
    };
  }, []);
  useEffect(() => {
    if (!settingsOpen && !pagesOpen && !profileOpen && !menuOpen && !appViewOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!settingsMenuRef.current?.contains(event.target)) setSettingsOpen(false);
      if (!pagesMenuRef.current?.contains(event.target)) setPagesOpen(false);
      if (!profileMenuRef.current?.contains(event.target)) setProfileOpen(false);
      if (!appViewMenuRef.current?.contains(event.target)) setAppViewOpen(false);
      const target = event.target instanceof Element ? event.target : event.target.parentElement;
      if (!target?.closest(".site-header nav") && !target?.closest(".menu-toggle")) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeHeaderMenus();
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [settingsOpen, pagesOpen, profileOpen, menuOpen, appViewOpen, closeHeaderMenus]);
  useEffect(() => {
    fetch("/api/menu", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data: { dishes?: Dish[] } | null) => {
      if (data?.dishes) setSearchDishes(data.dishes);
    }).catch(() => undefined);
  }, []);
  const searchSuggestions = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value ? searchDishes.filter((dish) => matchesDishSearch(dish, value)).slice(0, 5) : [];
  }, [query, searchDishes]);
  function updateSound(enabled: boolean) {
    setSoundEnabled(enabled);
    localStorage.setItem("hmf_sound", enabled ? "on" : "off");
  }
  function updateCurrency(value: string) {
    setCurrency(value);
    localStorage.setItem("hmf_currency", value);
  }
  useEffect(() => {
    if (!cartOpen) return;
    const releaseScrollLock = acquireScrollLock();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setCartOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      releaseScrollLock();
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [cartOpen]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    router.push(value ? `/menu?search=${encodeURIComponent(value)}` : "/menu");
    setMenuOpen(false);
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="site-header-stack">
      <ScrollFillProgress />
      <div className="announcement-ticker" role="status" aria-label="Live store updates">
        <motion.div className="announcement-track" animate={{ x: "-50%" }} transition={{ duration: 30, ease: "linear", repeat: Infinity, repeatType: "loop" }}>
          <div className="announcement-group">
            <span>● Freshly cooked in Bahawalpur</span><span>Free delivery on orders above PKR 1,500</span><span>Open daily for homemade meals · Live order tracking available</span>
          </div>
          <div className="announcement-group" aria-hidden="true">
            <span>● Freshly cooked in Bahawalpur</span><span>Free delivery on orders above PKR 1,500</span><span>Open daily for homemade meals · Live order tracking available</span>
          </div>
        </motion.div>
      </div>
    <header className="site-header">
      <button className="menu-toggle" aria-label="Toggle menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>☰</button>
      <Link href="/" className="brand"><Image className="brand-mark" src={brandImage} width={52} height={52} alt="" unoptimized /><span>Home Made Food</span></Link>
      <details className="delivery-location">
        <summary><span className="location-pin" aria-hidden="true">⌖</span><span><small>{t("delivering")}</small><strong>{deliveryArea}⌄</strong></span></summary>
        <div className="location-options">
          <label htmlFor="delivery-area">{t("deliveryArea")}</label>
          <select id="delivery-area" value={deliveryArea} onChange={(event) => setDeliveryArea(event.target.value)}>
            <option>Bahawalpur</option><option>Model Town</option><option>University Chowk</option><option>Goheer Town</option>
          </select>
        </div>
      </details>
      <form className="header-search" role="search" onSubmit={search}>
        <span aria-hidden="true">⌕</span>
        <input aria-label={t("searchPlaceholder")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchPlaceholder")} />
        <button type="submit">{t("search")}</button>
        {searchSuggestions.length > 0 && <div className="header-search-suggestions">{searchSuggestions.map((dish) => <button type="button" key={dish.id} onClick={() => { setQuery(dish.name); router.push(`/menu?search=${encodeURIComponent(dish.name)}`); }}>{dish.name}<small>{dish.category}</small></button>)}</div>}
      </form>
      <nav className={`header-links ${menuOpen ? "open" : ""}`}>
        {links.map(([label, href]) => <Link key={href} href={href} onClick={closeHeaderMenus}>{t(label)}</Link>)}
        <div className="header-pages-menu" ref={pagesMenuRef}>
          <button type="button" className="header-pages-trigger" aria-expanded={pagesOpen} aria-controls="header-pages-popover" onClick={() => { setPagesOpen((open) => !open); setSettingsOpen(false); setProfileOpen(false); }}>
            Explore <span aria-hidden="true">⌄</span>
          </button>
          <AnimatePresence>
            {pagesOpen && <motion.nav id="header-pages-popover" className="header-pages-popover" aria-label="Footer navigation" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .15, ease: "easeOut" }}>
              {footerLinks.map(([label, href]) => <Link key={href} href={href} onClick={closeHeaderMenus}>{label}</Link>)}
            </motion.nav>}
          </AnimatePresence>
        </div>
        <div className="settings-menu" ref={settingsMenuRef}>
          <button type="button" className="settings-trigger" aria-expanded={settingsOpen} aria-controls="settings-popover" onClick={() => { setSettingsOpen((open) => !open); setPagesOpen(false); setProfileOpen(false); }}><span aria-hidden="true">⚙</span> Settings</button>
          <AnimatePresence>
            {settingsOpen && <motion.div id="settings-popover" className="settings-popover" initial={{ opacity: 0, y: -5, scale: .99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: .99 }} transition={{ duration: .15, ease: "easeOut" }}>
              <strong>Preferences</strong>
              <label><span>{t("language")}</span><select aria-label={t("language")} value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>{Object.entries(localeNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
              <label><span>{t("theme")}</span><select aria-label={t("theme")} value={theme} onChange={(event) => setTheme(event.target.value as Theme)}>{Object.entries(themeNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
              <label><span>Currency</span><select value={currency} onChange={(event) => updateCurrency(event.target.value)}><option value="PKR">PKR · Rs.</option><option value="USD">USD · $</option><option value="AED">AED · د.إ</option></select></label>
              <button type="button" className="preference-toggle" onClick={() => updateSound(!soundEnabled)}><span>Sound effects</span><span className={`toggle-pill ${soundEnabled ? "on" : ""}`} aria-hidden="true"><i /></span></button>
            </motion.div>}
          </AnimatePresence>
        </div>
        <div className="app-view-menu" ref={appViewMenuRef}>
          <motion.button type="button" className="app-view-toggle" whileTap={{ scale: 0.97 }} aria-expanded={appViewOpen} aria-controls="app-view-popover" onClick={() => { setAppViewOpen((open) => !open); setSettingsOpen(false); setPagesOpen(false); setProfileOpen(false); }}>
            <span aria-hidden="true">▣</span><span>App View</span><span aria-hidden="true">⌄</span>
          </motion.button>
          <AnimatePresence>
            {appViewOpen && <motion.div id="app-view-popover" className="app-view-popover" role="menu" aria-label="Choose app view" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .15, ease: "easeOut" }}>
              <strong>Choose your view</strong>
              {([ ["mobile-app", "Mobile App View", "▯"], ["desktop-app", "Desktop App View", "▣"], ["web", "Website View", "⌂"] ] as const).map(([mode, label, icon]) => <button type="button" role="menuitem" key={mode} onClick={() => {
                window.dispatchEvent(new CustomEvent("hmf_view_mode_changed", { detail: mode }));
                setAppViewOpen(false);
                if (pathname !== "/") router.push("/");
              }}><span aria-hidden="true">{icon}</span>{label}</button>)}
            </motion.div>}
          </AnimatePresence>
        </div>
        <AppInstallActions variant="compact" />
      </nav>
      <div className="profile-menu" ref={profileMenuRef}>
      <button
        className="profile-link"
        type="button"
        aria-label={customer?.emailVerified ? t("profile") : "Sign In / Register"}
        onClick={() => {
          if (!customer?.emailVerified) {
            window.dispatchEvent(
              new CustomEvent("hmf_open_auth_modal", {
                detail: { mode: "login", reason: "Sign in to access your profile, saved addresses, and live orders." },
              })
            );
          } else {
            setProfileOpen((open) => !open);
            setSettingsOpen(false);
            setPagesOpen(false);
          }
        }}
      >
        {customer?.avatarUrl ? (
          <Image
            src={customer.avatarUrl}
            alt=""
            width={24}
            height={24}
            unoptimized
            style={{ borderRadius: "50%", objectFit: "cover", display: "inline-block", marginRight: "6px" }}
          />
        ) : (
          <span aria-hidden="true">👤</span>
        )}
        <span className="profile-link-label">
          {customer?.name ? customer.name.split(" ")[0] : (customer?.emailVerified ? t("profile") : "Sign In")}
        </span>
        {customer?.emailVerified && (
          <span
            style={{
              display: "inline-block",
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "#16a34a",
              marginLeft: "4px",
            }}
            title="Verified"
          />
        )}
      </button>
      {customer?.emailVerified && profileOpen && <div className="profile-popover"><strong>{customer.name || customer.email?.split("@")[0] || "Welcome back"}</strong><Link href="/profile" onClick={closeHeaderMenus}>Your profile</Link><Link href="/track-order" onClick={closeHeaderMenus}>Order history</Link><button type="button" onClick={closeHeaderMenus}>Close</button></div>}
      </div>
      <motion.button className="icon-button cart-trigger" type="button" aria-label={`${t("cart")}, ${count}`} aria-expanded={cartOpen} aria-controls="header-cart-drawer" onClick={() => setCartOpen((open) => !open)} whileHover={{ scale: 1.06 }} whileTap={{ scale: .92 }}>
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>
        <motion.span key={count} className="cart-count" initial={{ scale: .5 }} animate={{ scale: 1 }}>{count}</motion.span>
      </motion.button>
      {cartOpen && typeof document !== "undefined" ? createPortal(<motion.div className="cart-drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
          <motion.aside id="header-cart-drawer" className="cart-drawer" role="dialog" aria-modal="true" aria-label={t("cart")} initial={{ x: 28, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 24, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 30 }}>
            <div className="cart-drawer-heading"><div><span>YOUR BAG</span><h2>{t("cart")}</h2></div><button type="button" aria-label="Close cart" onClick={() => setCartOpen(false)}>×</button></div>
            {items.length ? <div className="cart-drawer-items">{items.map((item, index) => <div className="cart-drawer-line" key={`${item.id}-${item.portion}-${item.specialInstructions ?? index}`}><span><strong>{item.name}</strong><small>{item.portion} · Qty {item.quantity}</small></span><b>Rs. {item.price * item.quantity}</b></div>)}</div> : <p className="cart-drawer-empty">Your bag is waiting for something homemade.</p>}
            <div className="cart-drawer-bottom"><div><span>Subtotal</span><strong>Rs. {items.reduce((sum, item) => sum + item.price * item.quantity, 0).toLocaleString()}</strong></div><Link href="/checkout" className="add-button" onClick={() => setCartOpen(false)}>Proceed to checkout <span aria-hidden="true">→</span></Link><Link href="/menu" className="cart-continue-link" onClick={() => setCartOpen(false)}>Continue browsing</Link></div>
          </motion.aside>
        </motion.div>, document.body) : null}
    </header>
    </div>
    </MotionConfig>
  );
}
