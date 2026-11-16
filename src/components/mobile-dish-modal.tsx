"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { Dish } from "@/lib/data";
import { useCart } from "@/components/cart-provider";
import { acquireScrollLock } from "@/lib/scroll-lock";

type MobileDishModalProps = {
  dish: Dish | null;
  isOpen: boolean;
  onClose: () => void;
};

const EXTRA_ADD_ONS = [
  { id: "raita", name: "Special Mint Raita", price: 50 },
  { id: "salad", name: "Fresh Kachumber Salad", price: 40 },
  { id: "shami", name: "Homemade Shami Kabab", price: 90 },
  { id: "drink", name: "Chilled Cold Drink (345ml)", price: 80 },
];

export function MobileDishModal({ dish, isOpen, onClose }: MobileDishModalProps) {
  const { addItem } = useCart();
  const [portionIndex, setPortionIndex] = useState(0);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [instructions, setInstructions] = useState("");
  const [addedSuccess, setAddedSuccess] = useState(false);

  // Reset local state when dish changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setPortionIndex(0);
      setSelectedAddOns([]);
      setQuantity(1);
      setInstructions("");
      setAddedSuccess(false);
      const releaseLock = acquireScrollLock();
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      window.addEventListener("keydown", onKeyDown);
      return () => {
        releaseLock();
        window.removeEventListener("keydown", onKeyDown);
      };
    }
  }, [isOpen, dish, onClose]);

  const portion = dish?.portions?.[portionIndex] ?? dish?.portions?.[0];

  const addOnsTotal = useMemo(() => {
    return selectedAddOns.reduce((sum, name) => {
      const match = EXTRA_ADD_ONS.find((a) => a.name === name);
      return sum + (match?.price ?? 0);
    }, 0);
  }, [selectedAddOns]);

  const unitPrice = (portion?.price ?? 0) + addOnsTotal;
  const totalPrice = unitPrice * quantity;

  if (!dish) return null;

  const handleToggleAddOn = (name: string) => {
    setSelectedAddOns((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const handleAddToCart = () => {
    if (!dish || !portion) return;
    const addOnText = selectedAddOns.length ? `Extras: ${selectedAddOns.join(", ")}` : "";
    const notes = [addOnText, instructions.trim()].filter(Boolean).join(" • ");

    addItem({
      id: dish.id,
      name: dish.name,
      portion: portion.name,
      price: unitPrice,
      quantity,
      specialInstructions: notes || undefined,
    });

    setAddedSuccess(true);
    setTimeout(() => {
      onClose();
    }, 450);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
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
            onClick={onClose}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(15, 23, 42, 0.65)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }}
          />

          {/* Modal Bottom Sheet */}
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
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 -10px 40px rgba(0,0,0,0.22)",
              overflow: "hidden",
              zIndex: 1,
            }}
          >
            {/* Top Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                position: "absolute",
                top: "14px",
                right: "14px",
                zIndex: 10,
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: "rgba(0, 0, 0, 0.55)",
                color: "#ffffff",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                cursor: "pointer",
                backdropFilter: "blur(4px)",
              }}
            >
              ✕
            </button>

            {/* Scrollable Body */}
            <div style={{ overflowY: "auto", flex: 1, paddingBottom: "20px" }}>
              {/* Dish Hero Image */}
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "230px",
                  background: "#f1f5f9",
                }}
              >
                {dish.imageUrl ? (
                  <Image
                    src={dish.imageUrl}
                    alt={dish.name}
                    fill
                    sizes="100vw"
                    unoptimized
                    style={{ objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "64px",
                      background: "linear-gradient(135deg, #fef3c7, #fde68a)",
                    }}
                  >
                    {dish.image || "🍲"}
                  </div>
                )}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 50%)",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    bottom: "12px",
                    left: "16px",
                    background: "#059669",
                    color: "#ffffff",
                    fontSize: "11px",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    padding: "4px 10px",
                    borderRadius: "9999px",
                  }}
                >
                  {dish.category}
                </span>
              </div>

              {/* Title & Stats */}
              <div style={{ padding: "16px 18px 12px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "12px",
                  }}
                >
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "20px",
                      fontWeight: 800,
                      color: "#0f172a",
                      fontFamily: "Outfit, sans-serif",
                      lineHeight: 1.25,
                    }}
                  >
                    {dish.name}
                  </h2>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: 800,
                      color: "#059669",
                      whiteSpace: "nowrap",
                    }}
                  >
                    PKR {unitPrice.toLocaleString()}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginTop: "8px",
                    fontSize: "12px",
                    color: "#64748b",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px",
                      background: "#fef3c7",
                      color: "#b45309",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "6px",
                    }}
                  >
                    ★ {dish.rating ? dish.rating.toFixed(1) : "4.9"} (
                    {dish.ratingCount ?? 38})
                  </span>
                  <span>⏱ 25–35 min</span>
                  <span>•</span>
                  <span>🔥 Fresh Homemade</span>
                </div>

                <p
                  style={{
                    marginTop: "10px",
                    marginBottom: "0",
                    fontSize: "13px",
                    lineHeight: 1.55,
                    color: "#475569",
                  }}
                >
                  {dish.description}
                </p>
              </div>

              <div
                style={{
                  height: "8px",
                  background: "#f8fafc",
                  borderTop: "1px solid #f1f5f9",
                  borderBottom: "1px solid #f1f5f9",
                }}
              />

              {/* Portion Sizes */}
              <div style={{ padding: "14px 18px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "10px",
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#1e293b",
                    }}
                  >
                    Select Portion Size
                  </h3>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "#059669",
                      background: "#ecfdf5",
                      padding: "2px 8px",
                      borderRadius: "9999px",
                      fontWeight: 700,
                    }}
                  >
                    Required
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {dish.portions.map((p, idx) => {
                    const isSelected = portionIndex === idx;
                    return (
                      <label
                        key={p.name}
                        onClick={() => setPortionIndex(idx)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "12px 14px",
                          borderRadius: "14px",
                          border: isSelected
                            ? "2px solid #059669"
                            : "1px solid #e2e8f0",
                          background: isSelected ? "#f0fdf4" : "#ffffff",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div
                            style={{
                              width: "18px",
                              height: "18px",
                              borderRadius: "50%",
                              border: isSelected
                                ? "5px solid #059669"
                                : "2px solid #cbd5e1",
                              background: "#ffffff",
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              fontSize: "13px",
                              fontWeight: isSelected ? 700 : 500,
                              color: isSelected ? "#065f46" : "#334155",
                            }}
                          >
                            {p.name}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: "13px",
                            fontWeight: 700,
                            color: isSelected ? "#059669" : "#64748b",
                          }}
                        >
                          PKR {p.price.toLocaleString()}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div
                style={{
                  height: "8px",
                  background: "#f8fafc",
                  borderTop: "1px solid #f1f5f9",
                  borderBottom: "1px solid #f1f5f9",
                }}
              />

              {/* Add-ons & Extras */}
              <div style={{ padding: "14px 18px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "10px",
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#1e293b",
                    }}
                  >
                    Recommended Add-ons
                  </h3>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>Optional</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {EXTRA_ADD_ONS.map((addOn) => {
                    const isChecked = selectedAddOns.includes(addOn.name);
                    return (
                      <label
                        key={addOn.id}
                        onClick={() => handleToggleAddOn(addOn.name)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          borderRadius: "12px",
                          border: isChecked
                            ? "1px solid #059669"
                            : "1px solid #f1f5f9",
                          background: isChecked ? "#f0fdf4" : "#ffffff",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div
                            style={{
                              width: "18px",
                              height: "18px",
                              borderRadius: "4px",
                              border: isChecked
                                ? "none"
                                : "2px solid #cbd5e1",
                              background: isChecked ? "#059669" : "#ffffff",
                              color: "#ffffff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "12px",
                              fontWeight: "bold",
                              flexShrink: 0,
                            }}
                          >
                            {isChecked ? "✓" : null}
                          </div>
                          <span
                            style={{
                              fontSize: "13px",
                              fontWeight: isChecked ? 600 : 500,
                              color: "#334155",
                            }}
                          >
                            {addOn.name}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: "12px",
                            fontWeight: 700,
                            color: "#059669",
                          }}
                        >
                          +PKR {addOn.price}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Special Instructions */}
              <div style={{ padding: "8px 18px 0" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  Kitchen Notes & Instructions
                </label>
                <input
                  type="text"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Mild spice, extra spoon, ringing bell..."
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "12px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13px",
                    outline: "none",
                    background: "#f8fafc",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            {/* Sticky Bottom Bar */}
            <div
              style={{
                padding: "12px 18px 18px",
                borderTop: "1px solid #e2e8f0",
                background: "#ffffff",
                display: "flex",
                alignItems: "center",
                gap: "14px",
                boxShadow: "0 -4px 16px rgba(0,0,0,0.04)",
              }}
            >
              {/* Quantity Stepper */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "#f1f5f9",
                  borderRadius: "14px",
                  padding: "4px",
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    border: "none",
                    background: "#ffffff",
                    color: "#0f172a",
                    fontSize: "18px",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                  }}
                >
                  −
                </button>
                <span
                  style={{
                    width: "34px",
                    textAlign: "center",
                    fontWeight: 800,
                    fontSize: "15px",
                    color: "#0f172a",
                  }}
                >
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    border: "none",
                    background: "#ffffff",
                    color: "#0f172a",
                    fontSize: "18px",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                  }}
                >
                  +
                </button>
              </div>

              {/* Add to Cart Button */}
              <button
                type="button"
                onClick={handleAddToCart}
                style={{
                  flex: 1,
                  height: "46px",
                  borderRadius: "14px",
                  border: "none",
                  background: addedSuccess
                    ? "#10b981"
                    : "linear-gradient(135deg, #059669 0%, #047857 100%)",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  cursor: "pointer",
                  boxShadow: "0 6px 20px rgba(5, 150, 105, 0.35)",
                  transition: "all 0.2s ease",
                }}
              >
                {addedSuccess ? (
                  <>
                    <span>✓</span> Added to Cart
                  </>
                ) : (
                  <>
                    <span>Add to Cart</span>
                    <span>•</span>
                    <span>PKR {totalPrice.toLocaleString()}</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
