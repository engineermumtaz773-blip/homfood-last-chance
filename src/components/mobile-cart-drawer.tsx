"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useCart } from "@/components/cart-provider";
import { OPEN_MOBILE_CART_EVENT } from "@/components/mobile-bottom-nav";
import { PaymentVoucherPage } from "@/components/payment-voucher-page";
import {
  generateEmvcoRaastQrString,
  RAAST_MERCHANT_IBAN,
  RAAST_MERCHANT_NAME,
  RAAST_REF_NUMBER,
} from "@/lib/emvco-qr";
import { QRCodeSVG } from "qrcode.react";

export function MobileCartDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const { items, updateQuantity, removeItem } = useCart();

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener(OPEN_MOBILE_CART_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_MOBILE_CART_EVENT, handleOpen);
  }, []);

  const totalAmount = useMemo(
    () => items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [items]
  );

  const emvcoPayload = useMemo(() => {
    return generateEmvcoRaastQrString({
      merchantName: RAAST_MERCHANT_NAME,
      ref: RAAST_REF_NUMBER,
      iban: RAAST_MERCHANT_IBAN,
      amount: totalAmount,
      city: "Bahawalpur",
      purpose: "Food Order",
    });
  }, [totalAmount]);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99998,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
            }}
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(15, 23, 42, 0.65)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
              }}
            />

            {/* Bottom Sheet Modal */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              style={{
                position: "relative",
                background: "#ffffff",
                borderTopLeftRadius: "28px",
                borderTopRightRadius: "28px",
                maxHeight: "88vh",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 -10px 40px rgba(0,0,0,0.2)",
                overflow: "hidden",
                zIndex: 1,
              }}
            >
              {/* Drag Handle */}
              <div style={{ display: "flex", justifyContent: "center", paddingTop: "12px", paddingBottom: "6px" }}>
                <div style={{ width: "40px", height: "5px", borderRadius: "9999px", background: "#cbd5e1" }} />
              </div>

              {/* Sheet Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 24px 16px 24px",
                  borderBottom: "1px solid #f1f5f9",
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>
                    Your Order Basket
                  </h3>
                  <small style={{ color: "#64748b", fontSize: "12px" }}>
                    {items.length} {items.length === 1 ? "item" : "items"} ready for Bahawalpur delivery
                  </small>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  style={{
                    background: "#f1f5f9",
                    border: "none",
                    borderRadius: "50%",
                    width: "32px",
                    height: "32px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "16px",
                    color: "#475569",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Items List Scroll */}
              <div style={{ overflowY: "auto", padding: "16px 24px", flex: 1 }}>
                {items.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "36px 0" }}>
                    <div style={{ fontSize: "40px", marginBottom: "10px" }}>🛍️</div>
                    <strong style={{ display: "block", color: "#1e293b", fontSize: "16px" }}>
                      Your basket is empty
                    </strong>
                    <p style={{ margin: "6px 0 16px 0", fontSize: "13px", color: "#64748b" }}>
                      Add delicious homemade dishes from our menu to get started.
                    </p>
                    <Link
                      href="/menu"
                      onClick={() => setIsOpen(false)}
                      style={{
                        display: "inline-block",
                        padding: "10px 20px",
                        background: "#059669",
                        color: "#ffffff",
                        borderRadius: "12px",
                        fontSize: "13px",
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      Browse Menu
                    </Link>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {items.map((item) => (
                      <div
                        key={`${item.id}-${item.portion}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "12px 14px",
                          borderRadius: "16px",
                          border: "1px solid #f1f5f9",
                          background: "#f8fafc",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, marginRight: "12px" }}>
                          <strong style={{ display: "block", fontSize: "14px", color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.name}
                          </strong>
                          <span style={{ fontSize: "12px", color: "#64748b" }}>
                            {item.portion} · Rs. {item.price} each
                          </span>
                          {item.specialInstructions && (
                            <small style={{ display: "block", color: "#059669", fontSize: "11px" }}>
                              Note: {item.specialInstructions}
                            </small>
                          )}
                        </div>

                        {/* Quantity Counter */}
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              background: "#ffffff",
                              border: "1px solid #cbd5e1",
                              borderRadius: "10px",
                              padding: "2px",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (item.quantity <= 1) removeItem(item.id, item.portion, item.specialInstructions);
                                else updateQuantity(item.id, item.portion, item.quantity - 1, item.specialInstructions);
                              }}
                              style={{
                                width: "26px",
                                height: "26px",
                                border: "none",
                                background: "transparent",
                                fontSize: "15px",
                                fontWeight: 700,
                                color: "#475569",
                                cursor: "pointer",
                              }}
                            >
                              -
                            </button>
                            <span style={{ minWidth: "22px", textAlign: "center", fontSize: "13px", fontWeight: 700 }}>
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, item.portion, item.quantity + 1, item.specialInstructions)}
                              style={{
                                width: "26px",
                                height: "26px",
                                border: "none",
                                background: "transparent",
                                fontSize: "15px",
                                fontWeight: 700,
                                color: "#059669",
                                cursor: "pointer",
                              }}
                            >
                              +
                            </button>
                          </div>

                          <span style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a", minWidth: "60px", textAlign: "right" }}>
                            Rs. {item.price * item.quantity}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sheet Bottom Footer */}
              {items.length > 0 && (
                <div
                  style={{
                    padding: "16px 24px 28px 24px",
                    borderTop: "1px solid #f1f5f9",
                    background: "#ffffff",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "13px", color: "#64748b" }}>
                    <span>Subtotal</span>
                    <span>PKR {totalAmount.toLocaleString()}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontSize: "13px", color: "#16a34a" }}>
                    <span>Delivery (Bahawalpur)</span>
                    <strong style={{ fontWeight: 700 }}>FREE</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px", fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>
                    <span>Total Amount</span>
                    <span style={{ color: "#059669" }}>PKR {totalAmount.toLocaleString()}</span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    {/* Universal Raast QR Quick Pay */}
                    <button
                      type="button"
                      onClick={() => setIsQrModalOpen(true)}
                      style={{
                        padding: "13px 14px",
                        borderRadius: "14px",
                        border: "1px solid #059669",
                        background: "#ecfdf5",
                        color: "#047857",
                        fontSize: "13px",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                      }}
                    >
                      <span>⚡</span> Raast QR Pay
                    </button>

                    {/* Standard Checkout */}
                    <Link
                      href="/checkout"
                      onClick={() => setIsOpen(false)}
                      style={{
                        padding: "13px 14px",
                        borderRadius: "14px",
                        border: "none",
                        background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
                        color: "#ffffff",
                        fontSize: "13px",
                        fontWeight: 700,
                        textAlign: "center",
                        textDecoration: "none",
                        boxShadow: "0 4px 14px rgba(5, 150, 105, 0.35)",
                      }}
                    >
                      Checkout →
                    </Link>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dynamic Raast QR Pop-Up from Sheet */}
      <AnimatePresence>
        {isQrModalOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99999,
              background: "rgba(10, 15, 29, 0.8)",
              backdropFilter: "blur(12px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px",
            }}
            onClick={() => setIsQrModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: "380px",
                background: "#ffffff",
                borderRadius: "24px",
                padding: "24px",
                textAlign: "center",
                boxShadow: "0 25px 60px rgba(0,0,0,0.3)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "11px", fontWeight: 800, color: "#059669", letterSpacing: "1.5px", textTransform: "uppercase" }}>
                  SBP RAAST P2M CHECKOUT
                </span>
                <button
                  type="button"
                  onClick={() => setIsQrModalOpen(false)}
                  style={{ background: "#f1f5f9", border: "none", borderRadius: "50%", width: "28px", height: "28px", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>

              <h3 style={{ margin: "0 0 6px 0", fontSize: "18px", color: "#0f172a" }}>
                Scan to Pay PKR {totalAmount.toLocaleString()}
              </h3>
              <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "#64748b" }}>
                Merchant: <strong>{RAAST_MERCHANT_NAME}</strong> · MCB Bank
              </p>

              <div
                style={{
                  background: "#ffffff",
                  padding: "16px",
                  borderRadius: "16px",
                  border: "1px solid #e2e8f0",
                  display: "inline-block",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
                  marginBottom: "16px",
                }}
              >
                <QRCodeSVG value={emvcoPayload} size={220} level="M" />
              </div>

              <div style={{ background: "#f8fafc", padding: "10px", borderRadius: "10px", fontSize: "11px", color: "#475569", marginBottom: "16px" }}>
                Scannable from <strong>MCB Live</strong>, <strong>Easypaisa</strong>, <strong>JazzCash</strong>, <strong>SadaPay</strong>, and all Pakistani banks.
              </div>

              <Link
                href="/checkout"
                onClick={() => {
                  setIsQrModalOpen(false);
                  setIsOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "12px",
                  background: "#059669",
                  color: "#ffffff",
                  borderRadius: "12px",
                  fontWeight: 700,
                  fontSize: "13px",
                  textDecoration: "none",
                  boxSizing: "border-box",
                }}
              >
                I Have Paid · Submit Verification Receipt →
              </Link>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
