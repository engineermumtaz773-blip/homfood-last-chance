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
import { useSiteSettings, type Currency, type Locale, type Theme } from "@/components/site-settings";
import { acquireScrollLock } from "@/lib/scroll-lock";
import { readCustomerProfile, CUSTOMER_AUTH_EVENT, type CustomerProfile } from "@/lib/customer";
import { matchesDishSearch } from "@/lib/menu-search";
import { createSpeechRecognition } from "@/lib/web-speech";
import { setRecognitionLanguage } from "@/lib/voice";
import { customerNotificationTypes, getCustomerNotificationPreferences, requestCustomerNotificationPermission, saveCustomerNotificationPreferences, type CustomerNotificationPreferences, type CustomerNotificationType } from "@/lib/customer-notifications";

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
const footerTranslationKeys: Record<string, string> = {
  Home: "home",
  Menu: "menu",
  "Track Order": "track",
  "Meal plans": "mealPlans",
  Reservations: "reservations",
  "Help & FAQ": "helpFaq",
  "Your Profile": "yourProfile",
  About: "about",
  Contact: "contact",
};
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
  const [notifications, setNotifications] = useState<CustomerNotificationPreferences>({
    orderUpdates: false,
    deliveryUpdates: false,
    paymentUpdates: false,
    promotions: false,
    menuUpdates: false,
  });
  const [notificationMessage, setNotificationMessage] = useState("");
  const [searchRequested, setSearchRequested] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const pagesMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const appViewMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { items } = useCart();
  const { t, locale, theme, currency, setLocale, setTheme, setCurrency, formatCurrency, localeNames, themeNames } = useSiteSettings();
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
      setNotifications(getCustomerNotificationPreferences());
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
    if (!searchRequested || searchDishes.length) return;
    const controller = new AbortController();
    void fetch("/api/menu", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { dishes?: Dish[]; error?: string };
        if (!response.ok) throw new Error(data.error || `Menu search failed (${response.status}).`);
        return data;
      })
      .then((data) => {
        if (Array.isArray(data.dishes) && data.dishes.length > 0) setSearchDishes(data.dishes);
        else setSearchRequested(false);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("Could not load dishes for header search.", error);
        setSearchMessage(t("searchUnavailable"));
        setSearchRequested(false);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearchLoading(false);
      });
    return () => controller.abort();
  }, [searchRequested, searchDishes.length, t]);
  function requestSearch() {
    if (!searchDishes.length) setSearchLoading(true);
    setSearchRequested(true);
  }
  const searchSuggestions = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value ? searchDishes.filter((dish) => matchesDishSearch(dish, value)).slice(0, 5) : [];
  }, [query, searchDishes]);
  function updateSound(enabled: boolean) {
    setSoundEnabled(enabled);
    localStorage.setItem("hmf_sound", enabled ? "on" : "off");
  }
  function updateCurrency(value: string) {
    if (value === "PKR" || value === "USD" || value === "AED") setCurrency(value as Currency);
  }
  async function updateNotification(type: CustomerNotificationType, enabled: boolean) {
    setNotificationMessage("");
    if (enabled) {
      try {
        if (!await requestCustomerNotificationPermission()) {
          setNotificationMessage(t("notificationsUnavailable"));
          return;
        }
      } catch (error) {
        console.error("Could not request notification permission.", error);
        setNotificationMessage(t("notificationsUnavailable"));
        return;
      }
    }
    const updated = { ...notifications, [type]: enabled };
    setNotifications(updated);
    saveCustomerNotificationPreferences(updated);
  }
  function startHeaderVoiceSearch() {
    const recognition = createSpeechRecognition();
    if (!recognition) {
      setSearchMessage(t("voiceUnsupported"));
      return;
    }
    setRecognitionLanguage(recognition, locale);
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      setQuery(transcript);
      requestSearch();
      setSearchMessage(`${t("searchingFor")} “${transcript}”.`);
      setMenuOpen(false);
      router.push(`/menu?search=${encodeURIComponent(transcript)}`);
    };
    recognition.onerror = (event) => {
      setSearchMessage(event.error === "not-allowed" ? t("microphonePermission") : t("voiceFailed"));
      setVoiceListening(false);
    };
    recognition.onend = () => setVoiceListening(false);
    try {
      requestSearch();
      setVoiceListening(true);
      setSearchMessage(t("voiceListening"));
      recognition.start();
    } catch (error) {
      console.error("Could not start header voice search.", error);
      setVoiceListening(false);
      setSearchMessage(t("voiceFailed"));
    }
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
      <div className="announcement-ticker" role="status" aria-label={t("openDailyTrack")}>
        <motion.div className="announcement-track" animate={{ x: "-50%" }} transition={{ duration: 30, ease: "linear", repeat: Infinity, repeatType: "loop" }}>
          <div className="announcement-group">
            <span>● {t("freshCookedIn")}</span><span>{t("freeDeliveryAbove")} {formatCurrency(1500)}</span><span>{t("openDailyTrack")}</span>
          </div>
          <div className="announcement-group" aria-hidden="true">
            <span>● {t("freshCookedIn")}</span><span>{t("freeDeliveryAbove")} {formatCurrency(1500)}</span><span>{t("openDailyTrack")}</span>
          </div>
        </motion.div>
      </div>
    <header className="site-header">
      <button type="button" className="menu-toggle" aria-label={t("openMenu")} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>☰</button>
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
        <input aria-label={t("searchPlaceholder")} value={query} onFocus={requestSearch} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchPlaceholder")} />
        <button type="button" className="header-voice-search" aria-label={t("voiceSearch")} title={t("voiceSearch")} aria-pressed={voiceListening} disabled={voiceListening} onClick={startHeaderVoiceSearch}>
          {voiceListening ? "…" : "🎙"}
        </button>
        <button type="submit">{t("search")}</button>
        {(searchSuggestions.length > 0 || searchLoading || searchMessage) && <div className="header-search-suggestions">
          {searchSuggestions.map((dish) => <button type="button" key={dish.id} onClick={() => { setQuery(dish.name); router.push(`/menu?search=${encodeURIComponent(dish.name)}`); }}>{dish.name}<small>{dish.category}</small></button>)}
          {searchLoading && <small role="status">{t("searchLoading")}</small>}
          {searchMessage && <small role="status">{searchMessage}</small>}
        </div>}
      </form>
      <nav className={`header-links ${menuOpen ? "open" : ""}`}>
        {links.map(([label, href]) => <Link key={href} href={href} onClick={closeHeaderMenus}>{t(label)}</Link>)}
        <div className="header-pages-menu" ref={pagesMenuRef}>
          <button type="button" className="header-pages-trigger" aria-expanded={pagesOpen} aria-controls="header-pages-popover" onClick={() => { setPagesOpen((open) => !open); setSettingsOpen(false); setProfileOpen(false); }}>
            Explore <span aria-hidden="true">⌄</span>
          </button>
          <AnimatePresence>
            {pagesOpen && <motion.nav id="header-pages-popover" className="header-pages-popover" aria-label="Footer navigation" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .15, ease: "easeOut" }}>
              {footerLinks.map(([label, href]) => <Link key={href} href={href} onClick={closeHeaderMenus}>{t(footerTranslationKeys[label] || label)}</Link>)}
            </motion.nav>}
          </AnimatePresence>
        </div>
        <div className="settings-menu" ref={settingsMenuRef}>
          <button type="button" className="settings-trigger" aria-expanded={settingsOpen} aria-controls="settings-popover" onClick={() => { setSettingsOpen((open) => !open); setPagesOpen(false); setProfileOpen(false); }}><span aria-hidden="true">⚙</span> {t("settings")}</button>
          <AnimatePresence>
            {settingsOpen && <motion.div id="settings-popover" className="settings-popover" initial={{ opacity: 0, y: -5, scale: .99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: .99 }} transition={{ duration: .15, ease: "easeOut" }}>
              <strong>{t("preferences")}</strong>
              <label><span>{t("language")}</span><select aria-label={t("language")} value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>{Object.entries(localeNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
              <label><span>{t("theme")}</span><select aria-label={t("theme")} value={theme} onChange={(event) => setTheme(event.target.value as Theme)}>{Object.entries(themeNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
              <label><span>{t("currency")}</span><select aria-label={t("currency")} value={currency} onChange={(event) => updateCurrency(event.target.value)}><option value="PKR">PKR · Rs.</option><option value="USD">USD · $</option><option value="AED">AED · د.إ</option></select></label>
              <small className="currency-rate-note">{t("displayRateNote")}</small>
              <button type="button" role="switch" aria-checked={soundEnabled} className="preference-toggle" onClick={() => updateSound(!soundEnabled)}><span>{t("soundEffects")}</span><span className={`toggle-pill ${soundEnabled ? "on" : ""}`} aria-hidden="true"><i /></span></button>
              <fieldset className="notification-preferences">
                <legend>{t("notifications")}</legend>
                {customerNotificationTypes.map((type) => <button type="button" role="switch" aria-checked={notifications[type]} className="preference-toggle" key={type} onClick={() => void updateNotification(type, !notifications[type])}>
                  <span>{t(type)}</span><span className={`toggle-pill ${notifications[type] ? "on" : ""}`} aria-hidden="true"><i /></span>
                </button>)}
                <small>{notificationMessage || t("notificationPermission")}</small>
              </fieldset>
            </motion.div>}
          </AnimatePresence>
        </div>
        <div className="app-view-menu" ref={appViewMenuRef}>
          <motion.button type="button" className="app-view-toggle" whileTap={{ scale: 0.97 }} aria-expanded={appViewOpen} aria-controls="app-view-popover" onClick={() => { setAppViewOpen((open) => !open); setSettingsOpen(false); setPagesOpen(false); setProfileOpen(false); }}>
            <span aria-hidden="true">▣</span><span>{t("appView")}</span><span aria-hidden="true">⌄</span>
          </motion.button>
          <AnimatePresence>
            {appViewOpen && <motion.div id="app-view-popover" className="app-view-popover" role="menu" aria-label={t("chooseView")} initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .15, ease: "easeOut" }}>
              <strong>{t("chooseView")}</strong>
              {([ ["mobile-app", t("mobileAppView"), "▯"], ["desktop-app", t("desktopAppView"), "▣"], ["web", t("websiteView"), "⌂"] ] as const).map(([mode, label, icon]) => <button type="button" role="menuitem" key={mode} onClick={() => {
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
        aria-label={customer?.emailVerified ? t("profile") : t("signInRegister")}
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
          {customer?.name ? customer.name.split(" ")[0] : (customer?.emailVerified ? t("profile") : t("signIn"))}
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
            title={t("verified")}
          />
        )}
      </button>
      {customer?.emailVerified && profileOpen && <div className="profile-popover"><strong>{customer.name || customer.email?.split("@")[0] || t("welcomeBack")}</strong><Link href="/profile" onClick={closeHeaderMenus}>{t("yourProfile")}</Link><Link href="/track-order" onClick={closeHeaderMenus}>{t("orderHistory")}</Link><button type="button" onClick={closeHeaderMenus}>{t("close")}</button></div>}
      </div>
      <motion.button className="icon-button cart-trigger" type="button" aria-label={`${t("cart")}, ${count}`} aria-expanded={cartOpen} aria-controls="header-cart-drawer" onClick={() => setCartOpen((open) => !open)} whileHover={{ scale: 1.06 }} whileTap={{ scale: .92 }}>
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>
        <motion.span key={count} className="cart-count" initial={{ scale: .5 }} animate={{ scale: 1 }}>{count}</motion.span>
      </motion.button>
      {cartOpen && typeof document !== "undefined" ? createPortal(<motion.div className="cart-drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
          <motion.aside id="header-cart-drawer" className="cart-drawer" role="dialog" aria-modal="true" aria-label={t("cart")} initial={{ x: 28, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 24, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 30 }}>
            <div className="cart-drawer-heading"><div><span>{t("cart")}</span><h2>{t("cart")}</h2></div><button type="button" aria-label={t("close")} onClick={() => setCartOpen(false)}>×</button></div>
            {items.length ? <div className="cart-drawer-items">{items.map((item, index) => <div className="cart-drawer-line" key={`${item.id}-${item.portion}-${item.specialInstructions ?? index}`}><span><strong>{item.name}</strong><small>{item.portion} · {t("quantity")} {item.quantity}</small></span><b>{formatCurrency(item.price * item.quantity)}</b></div>)}</div> : <p className="cart-drawer-empty">{t("emptyCart")}</p>}
            <div className="cart-drawer-bottom"><div><span>{t("subtotal")}</span><strong>{formatCurrency(items.reduce((sum, item) => sum + item.price * item.quantity, 0))}</strong></div><Link href="/checkout" className="add-button" onClick={() => setCartOpen(false)}>{t("proceedCheckout")} <span aria-hidden="true">→</span></Link><Link href="/menu" className="cart-continue-link" onClick={() => setCartOpen(false)}>{t("continueBrowsing")}</Link></div>
          </motion.aside>
        </motion.div>, document.body) : null}
    </header>
    </div>
    </MotionConfig>
  );
}
