"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useCart } from "@/components/cart-provider";
import { useEffect, useState } from "react";
import { readCustomerProfile, CUSTOMER_AUTH_EVENT, type CustomerProfile } from "@/lib/customer";
import Image from "next/image";

export const OPEN_MOBILE_CART_EVENT = "hmf_open_mobile_cart";

export function MobileBottomNav() {
  const pathname = usePathname();
  const { items } = useCart();
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);

  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    const initialRead = window.requestAnimationFrame(() => setCustomer(readCustomerProfile()));
    const onAuth = (e: Event) => {
      const custom = e as CustomEvent<CustomerProfile | null>;
      setCustomer(custom.detail || null);
    };
    window.addEventListener(CUSTOMER_AUTH_EVENT, onAuth);
    return () => {
      window.cancelAnimationFrame(initialRead);
      window.removeEventListener(CUSTOMER_AUTH_EVENT, onAuth);
    };
  }, []);

  const openCart = () => {
    window.dispatchEvent(new CustomEvent(OPEN_MOBILE_CART_EVENT));
  };

  const navItems = [
    {
      label: "Home",
      href: "/",
      isActive: pathname === "/",
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "#059669" : "none"} stroke={active ? "#059669" : "#64748b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    {
      label: "Menu",
      href: "/menu",
      isActive: pathname === "/menu",
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#059669" : "#64748b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
          <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
          <line x1="6" y1="1" x2="6" y2="4" />
          <line x1="10" y1="1" x2="10" y2="4" />
          <line x1="14" y1="1" x2="14" y2="4" />
        </svg>
      ),
    },
    // Center Cart slot
    {
      label: "Orders",
      href: "/track-order",
      isActive: pathname === "/track-order",
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#059669" : "#64748b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
    },
    {
      label: "Profile",
      href: "/profile",
      isActive: pathname === "/profile",
      icon: (active: boolean) => (
        customer?.avatarUrl ? (
          <div style={{ position: "relative", width: "24px", height: "24px" }}>
            <Image
              src={customer.avatarUrl}
              alt=""
              width={24}
              height={24}
              unoptimized
              style={{
                borderRadius: "50%",
                objectFit: "cover",
                border: active ? "2px solid #059669" : "1px solid #cbd5e1",
              }}
            />
          </div>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "#059669" : "none"} stroke={active ? "#059669" : "#64748b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        )
      ),
    },
  ];

  return (
    <nav
      className="mobile-bottom-navbar"
      aria-label="Mobile Navigation"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "rgba(255, 255, 255, 0.94)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderTop: "1px solid rgba(226, 232, 240, 0.9)",
        boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.06)",
        height: "68px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
        padding: "0 8px 6px 8px",
      }}
    >
      {/* 1. Home */}
      <Link
        href={navItems[0].href}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "3px",
          color: navItems[0].isActive ? "#059669" : "#64748b",
          fontSize: "11px",
          fontWeight: navItems[0].isActive ? 700 : 500,
          textDecoration: "none",
          width: "56px",
        }}
      >
        {navItems[0].icon(navItems[0].isActive)}
        <span>{navItems[0].label}</span>
      </Link>

      {/* 2. Menu */}
      <Link
        href={navItems[1].href}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "3px",
          color: navItems[1].isActive ? "#059669" : "#64748b",
          fontSize: "11px",
          fontWeight: navItems[1].isActive ? 700 : 500,
          textDecoration: "none",
          width: "56px",
        }}
      >
        {navItems[1].icon(navItems[1].isActive)}
        <span>{navItems[1].label}</span>
      </Link>

      {/* 3. Center Elevated Floating Cart Button */}
      <div style={{ position: "relative", width: "64px", display: "flex", justifyContent: "center" }}>
        <motion.button
          type="button"
          onClick={openCart}
          whileTap={{ scale: 0.92 }}
          style={{
            position: "absolute",
            top: "-28px",
            width: "58px",
            height: "58px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
            color: "#ffffff",
            border: "4px solid #ffffff",
            boxShadow: "0 8px 24px rgba(5, 150, 105, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            outline: "none",
          }}
          aria-label={`View Cart, ${cartCount} items`}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>

          {cartCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              style={{
                position: "absolute",
                top: "-4px",
                right: "-4px",
                background: "#dc2626",
                color: "#ffffff",
                fontSize: "11px",
                fontWeight: 800,
                borderRadius: "50%",
                width: "20px",
                height: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid #ffffff",
                boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
              }}
            >
              {cartCount}
            </motion.span>
          )}
        </motion.button>
        <span
          style={{
            marginTop: "32px",
            fontSize: "11px",
            fontWeight: 700,
            color: "#059669",
          }}
        >
          Cart
        </span>
      </div>

      {/* 4. Orders */}
      <Link
        href={navItems[2].href}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "3px",
          color: navItems[2].isActive ? "#059669" : "#64748b",
          fontSize: "11px",
          fontWeight: navItems[2].isActive ? 700 : 500,
          textDecoration: "none",
          width: "56px",
        }}
      >
        {navItems[2].icon(navItems[2].isActive)}
        <span>{navItems[2].label}</span>
      </Link>

      {/* 5. Profile */}
      <Link
        href={navItems[3].href}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "3px",
          color: navItems[3].isActive ? "#059669" : "#64748b",
          fontSize: "11px",
          fontWeight: navItems[3].isActive ? 700 : 500,
          textDecoration: "none",
          width: "56px",
        }}
      >
        {navItems[3].icon(navItems[3].isActive)}
        <span>{navItems[3].label}</span>
      </Link>
    </nav>
  );
}
