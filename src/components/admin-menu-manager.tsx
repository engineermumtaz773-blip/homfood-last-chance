"use client";

import { useState, useMemo, type FormEvent, type ChangeEvent } from "react";
import { useLiveDishes } from "@/hooks/use-live-dishes";
import type { Dish, Portion } from "@/lib/data";

const DEFAULT_CATEGORIES = [
  "Breakfast",
  "Dinner",
  "Lunch",
  "test category",
  "Fast Food",
  "Traditional",
  "Snacks",
  "Sides",
  "Desserts & Drinks",
];

export function AdminMenuManager() {
  const { dishes, refresh } = useLiveDishes([]);
  const [view, setView] = useState<"list" | "edit">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("All Categories");
  const [statusMessage, setStatusMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit / Add form state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ingredientsText, setIngredientsText] = useState("");
  const [preparation, setPreparation] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(["Breakfast"]);
  const [portions, setPortions] = useState<Portion[]>([{ name: "regular", price: 150 }]);
  const [available, setAvailable] = useState(true);
  const [soldOut, setSoldOut] = useState(false);
  const [featured, setFeatured] = useState(false);
  const [imageUrl, setImageUrl] = useState("https://images.deliveryhero.io/image/fd-pk/Products/34140436.jpg?width=1200");
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [customImageInput, setCustomImageInput] = useState("");

  const allCategories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    dishes.forEach((d) => {
      if (Array.isArray(d.categories)) {
        d.categories.forEach((c) => set.add(c));
      } else if (d.category) {
        set.add(d.category);
      }
    });
    return Array.from(set);
  }, [dishes]);

  const filteredDishes = useMemo(() => {
    return dishes.filter((dish) => {
      const dishCats = Array.isArray(dish.categories) && dish.categories.length > 0 ? dish.categories : [dish.category];
      const matchCat =
        filterCategory === "All Categories" ||
        dishCats.some((c) => c.toLowerCase() === filterCategory.toLowerCase());
      const query = searchQuery.trim().toLowerCase();
      const matchSearch =
        !query ||
        dish.name.toLowerCase().includes(query) ||
        dishCats.some((c) => c.toLowerCase().includes(query)) ||
        dish.description.toLowerCase().includes(query);
      return matchCat && matchSearch;
    });
  }, [dishes, filterCategory, searchQuery]);

  function openAddDish() {
    setEditingId(null);
    setName("");
    setDescription("");
    setIngredientsText("");
    setPreparation("");
    setSelectedCategories(["Breakfast"]);
    setPortions([{ name: "regular", price: 150 }]);
    setAvailable(true);
    setSoldOut(false);
    setFeatured(false);
    setImageUrl("https://images.deliveryhero.io/image/fd-pk/Products/34140436.jpg?width=1200");
    setStatusMessage(null);
    setView("edit");
  }

  function openEditDish(dish: Dish) {
    setEditingId(dish.id);
    setName(dish.name);
    setDescription(dish.description);
    setIngredientsText((dish.ingredients || []).join("\n"));
    setPreparation(dish.preparation || "");
    const cats = Array.isArray(dish.categories) && dish.categories.length > 0 ? dish.categories : [dish.category];
    setSelectedCategories(cats);
    setPortions(dish.portions && dish.portions.length > 0 ? [...dish.portions] : [{ name: "regular", price: 150 }]);
    setAvailable(dish.available !== false && !dish.soldOut);
    setSoldOut(Boolean(dish.soldOut));
    setFeatured(Boolean(dish.featured));
    setImageUrl(dish.imageUrl || "https://images.deliveryhero.io/image/fd-pk/Products/34140436.jpg?width=1200");
    setStatusMessage(null);
    setView("edit");
  }

  function toggleCategory(cat: string) {
    setSelectedCategories((prev) => {
      if (prev.includes(cat)) {
        if (prev.length <= 1) return prev; // keep at least one
        return prev.filter((c) => c !== cat);
      }
      return [...prev, cat];
    });
  }

  function handleVariantChange(index: number, field: "name" | "price", value: string) {
    setPortions((prev) => {
      const copy = [...prev];
      if (field === "name") copy[index] = { ...copy[index], name: value };
      else copy[index] = { ...copy[index], price: Math.max(0, Number(value) || 0) };
      return copy;
    });
  }

  function addVariantRow() {
    setPortions((prev) => [...prev, { name: "regular", price: 150 }]);
  }

  function removeVariantRow(index: number) {
    if (portions.length <= 1) return;
    setPortions((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleImageUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const dataUrl = uploadEvent.target?.result as string;
      if (dataUrl) {
        setImageUrl(dataUrl);
        setShowReplaceModal(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveDish(e?: FormEvent) {
    if (e) e.preventDefault();
    if (!name.trim()) {
      setStatusMessage({ text: "Please enter a dish name.", error: true });
      return;
    }
    if (portions.length === 0 || portions.some((p) => p.price <= 0)) {
      setStatusMessage({ text: "Please enter a valid price for all variants.", error: true });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage({ text: "Saving changes to database..." });

    try {
      const existingDish = editingId === null ? undefined : dishes.find((dish) => dish.id === editingId);
      const payload = {
        id: editingId ?? undefined,
        name: name.trim(),
        description: description.trim(),
        ingredients: ingredientsText.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean),
        preparation: preparation.trim(),
        category: selectedCategories[0] || "Breakfast",
        categories: selectedCategories,
        portions,
        imageUrl: imageUrl.trim(),
        available: !soldOut && available,
        soldOut,
        featured,
        dailyStockLimit: existingDish?.dailyStockLimit ?? null,
        remainingStock: existingDish?.remainingStock ?? null,
        ...(existingDish?.nutrition ? { nutrition: existingDish.nutrition } : {}),
        allergens: existingDish?.allergens ?? [],
        addons: existingDish?.addons ?? [],
      };

      const res = await fetch("/api/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null) as { success?: boolean; dish?: Dish; error?: string; message?: string } | null;
      if (!res.ok) throw new Error(data?.error || data?.message || `Database rejected the dish update (HTTP ${res.status}).`);

      if (data?.success && data.dish) {
        setStatusMessage({ text: `✓ "${name}" saved to database successfully!` });
        try {
          const channel = new BroadcastChannel("hmf_menu_channel");
          channel.postMessage("menu-updated");
          channel.close();
        } catch {
          /* broadcast optional */
        }
        window.dispatchEvent(new Event("hmf-stock-change"));
        await refresh();
        setView("list");
      } else throw new Error(data?.error || data?.message || "The database did not confirm the dish save.");
    } catch (err) {
      console.error(err);
      setStatusMessage({ text: err instanceof Error ? err.message : "Could not save this dish. Check the database configuration and try again.", error: true });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteDish(id: number, dishName: string) {
    if (!window.confirm(`Are you sure you want to delete "${dishName}" from the menu?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/menu?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatusMessage({ text: `✓ "${dishName}" deleted from database.` });
      try {
        const channel = new BroadcastChannel("hmf_menu_channel");
        channel.postMessage("menu-deleted");
        channel.close();
      } catch {
        /* broadcast optional */
      }
      window.dispatchEvent(new Event("hmf-stock-change"));
      await refresh();
    } catch (err) {
      console.error(err);
      setStatusMessage({ text: "Failed to delete dish.", error: true });
    }
  }

  // ================= VIEW: LIST DISHES (Matches Image 1) =================
  if (view === "list") {
    return (
      <div style={{ maxWidth: "1080px", margin: "0 auto", color: "#111827" }}>
        {statusMessage && (
          <div
            style={{
              padding: "12px 18px",
              borderRadius: "10px",
              marginBottom: "18px",
              background: statusMessage.error ? "#fef2f2" : "#f0fdf4",
              color: statusMessage.error ? "#991b1b" : "#166534",
              fontWeight: 500,
              fontSize: "14px",
              border: `1px solid ${statusMessage.error ? "#fecaca" : "#bbf7d0"}`,
            }}
          >
            {statusMessage.text}
          </div>
        )}

        {/* Section Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 6px 0", letterSpacing: "-0.4px" }}>
              Menu Management
            </h1>
            <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>
              Add, edit, and organize the dishes shown on your public menu.
            </p>
          </div>
          <button
            type="button"
            onClick={openAddDish}
            style={{
              background: "#111827",
              color: "#ffffff",
              border: "none",
              borderRadius: "9999px",
              padding: "10px 22px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <span>＋</span> Add Dish
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: "15px" }}>
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dishes..."
              style={{
                width: "100%",
                padding: "11px 14px 11px 40px",
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "10px",
                fontSize: "14px",
                outline: "none",
                color: "#111827",
              }}
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            style={{
              padding: "11px 16px",
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "10px",
              fontSize: "14px",
              outline: "none",
              color: "#374151",
              fontWeight: 500,
              cursor: "pointer",
              minWidth: "160px",
            }}
          >
            <option value="All Categories">All Categories</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Dishes List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {filteredDishes.length === 0 ? (
            <div style={{ background: "#ffffff", padding: "40px", borderRadius: "14px", textAlign: "center", border: "1px solid #e5e7eb", color: "#6b7280" }}>
              No dishes found matching your search.
            </div>
          ) : (
            filteredDishes.map((dish) => {
              const cats = Array.isArray(dish.categories) && dish.categories.length > 0 ? dish.categories : [dish.category];
              const isAvailable = dish.available !== false && !dish.soldOut;
              const isFeatured = Boolean(dish.featured);

              return (
                <div
                  key={dish.id}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    borderRadius: "14px",
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    gap: "18px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                  }}
                >
                  {/* Thumbnail Image */}
                  <img
                    src={dish.imageUrl || "https://images.deliveryhero.io/image/fd-pk/Products/34140436.jpg?width=1200"}
                    alt={dish.name}
                    style={{
                      width: "74px",
                      height: "74px",
                      borderRadius: "12px",
                      objectFit: "cover",
                      background: "#f3f4f6",
                      flexShrink: 0,
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "https://images.deliveryhero.io/image/fd-pk/Products/34140436.jpg?width=1200";
                    }}
                  />

                  {/* Middle Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Title + Badges */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
                      <span style={{ fontSize: "16px", fontWeight: 700, color: "#111827" }}>
                        {dish.name}
                      </span>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 500,
                          padding: "2px 9px",
                          borderRadius: "9999px",
                          background: "#f3f4f6",
                          color: "#374151",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                        }}
                      >
                        <span
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            background: isAvailable ? "#10b981" : "#ef4444",
                          }}
                        />
                        {isAvailable ? "Available" : "Sold Out"}
                      </span>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 500,
                          padding: "2px 9px",
                          borderRadius: "9999px",
                          background: "#f3f4f6",
                          color: "#374151",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                        }}
                      >
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#9ca3af" }} />
                        {isFeatured ? "Featured" : "Standard"}
                      </span>
                    </div>

                    {/* Category Tags */}
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
                      {cats.map((cat) => (
                        <span
                          key={cat}
                          style={{
                            background: "#f3f4f6",
                            padding: "2px 10px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            color: "#4b5563",
                            fontWeight: 500,
                          }}
                        >
                          {cat}
                        </span>
                      ))}
                    </div>

                    {/* Variant Price Pills */}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {dish.portions.map((p, idx) => (
                        <span
                          key={idx}
                          style={{
                            background: "#f9fafb",
                            border: "1px solid #e5e7eb",
                            padding: "3px 12px",
                            borderRadius: "6px",
                            fontSize: "13px",
                            fontWeight: 500,
                            color: "#1f2937",
                          }}
                        >
                          {p.name} Rs. {p.price}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions (Pencil & Trash Icons) */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => openEditDish(dish)}
                      title="Edit dish"
                      style={{
                        background: "none",
                        border: "none",
                        width: "36px",
                        height: "36px",
                        borderRadius: "8px",
                        cursor: "pointer",
                        display: "grid",
                        placeItems: "center",
                        color: "#4b5563",
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteDish(dish.id, dish.name)}
                      title="Delete dish"
                      style={{
                        background: "none",
                        border: "none",
                        width: "36px",
                        height: "36px",
                        borderRadius: "8px",
                        cursor: "pointer",
                        display: "grid",
                        placeItems: "center",
                        color: "#ef4444",
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // ================= VIEW: EDIT DISH (Matches Image 2) =================
  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", color: "#111827", paddingBottom: "60px" }}>
      {/* Back button */}
      <button
        type="button"
        onClick={() => setView("list")}
        style={{
          background: "none",
          border: "none",
          color: "#4b5563",
          fontSize: "13px",
          fontWeight: 600,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          marginBottom: "16px",
          padding: 0,
        }}
      >
        ← Back to Menu
      </button>

      {/* Heading */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 4px 0", letterSpacing: "-0.4px" }}>
          {editingId ? "Edit Dish" : "Add Dish"}
        </h1>
        <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>
          {editingId ? `Update details for "${name}".` : "Add, edit, and organize the dishes shown on your public menu."}
        </p>
      </div>

      {statusMessage && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: "10px",
            marginBottom: "18px",
            background: statusMessage.error ? "#fef2f2" : "#f0fdf4",
            color: statusMessage.error ? "#991b1b" : "#166534",
            fontWeight: 500,
            fontSize: "14px",
            border: `1px solid ${statusMessage.error ? "#fecaca" : "#bbf7d0"}`,
          }}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Card 1: General Information */}
      <section
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          border: "1px solid #e5e7eb",
          padding: "24px",
          marginBottom: "20px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        }}
      >
        <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 4px 0" }}>General Information</h2>
        <p style={{ margin: "0 0 18px 0", color: "#6b7280", fontSize: "13px" }}>
          The dish name and description shown to customers.
        </p>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
            Dish Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Aloo Wala Paratha"
            required
            style={{
              width: "100%",
              padding: "11px 14px",
              borderRadius: "10px",
              border: "1px solid #e5e7eb",
              fontSize: "14px",
              outline: "none",
              color: "#111827",
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Traditional homemade paratha stuffed with flavorful spiced potatoes, freshly prepared."
            style={{
              width: "100%",
              padding: "11px 14px",
              borderRadius: "10px",
              border: "1px solid #e5e7eb",
              fontSize: "14px",
              outline: "none",
              color: "#111827",
              resize: "vertical",
            }}
          />
        </div>
        <div style={{ marginTop: "16px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
            Ingredients (one per line)
          </label>
          <textarea
            value={ingredientsText}
            onChange={(e) => setIngredientsText(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="Add only the verified ingredients used in this dish."
            style={{
              width: "100%",
              padding: "11px 14px",
              borderRadius: "10px",
              border: "1px solid #e5e7eb",
              fontSize: "14px",
              outline: "none",
              color: "#111827",
              resize: "vertical",
            }}
          />
        </div>
        <div style={{ marginTop: "16px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
            Preparation details
          </label>
          <textarea
            value={preparation}
            onChange={(e) => setPreparation(e.target.value)}
            rows={4}
            maxLength={3000}
            placeholder="Describe how the kitchen prepares this dish."
            style={{
              width: "100%",
              padding: "11px 14px",
              borderRadius: "10px",
              border: "1px solid #e5e7eb",
              fontSize: "14px",
              outline: "none",
              color: "#111827",
              resize: "vertical",
            }}
          />
        </div>
      </section>

      {/* Card 2: Categories */}
      <section
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          border: "1px solid #e5e7eb",
          padding: "24px",
          marginBottom: "20px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        }}
      >
        <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 4px 0" }}>Categories</h2>
        <p style={{ margin: "0 0 16px 0", color: "#6b7280", fontSize: "13px" }}>
          Select every category this dish should appear under.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {allCategories.map((cat) => {
            const isSelected = selectedCategories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                style={{
                  background: isSelected ? "#111827" : "#f3f4f6",
                  color: isSelected ? "#ffffff" : "#374151",
                  border: "none",
                  borderRadius: "9999px",
                  padding: "8px 18px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </section>

      {/* Card 3: Variants */}
      <section
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          border: "1px solid #e5e7eb",
          padding: "24px",
          marginBottom: "20px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        }}
      >
        <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 4px 0" }}>Variants</h2>
        <p style={{ margin: "0 0 16px 0", color: "#6b7280", fontSize: "13px" }}>
          Add one or more size/price options for this dish.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
          {portions.map((portion, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 140px 40px", gap: "12px", alignItems: "center" }}>
              <div>
                {idx === 0 && (
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#6b7280", marginBottom: "4px" }}>
                    Variant Name
                  </label>
                )}
                <input
                  type="text"
                  value={portion.name}
                  onChange={(e) => handleVariantChange(idx, "name", e.target.value)}
                  placeholder="e.g. regular or Full Plate"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #e5e7eb",
                    fontSize: "14px",
                    outline: "none",
                    color: "#111827",
                  }}
                />
              </div>

              <div>
                {idx === 0 && (
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#6b7280", marginBottom: "4px" }}>
                    Price (Rs.)
                  </label>
                )}
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={portion.price}
                  onChange={(e) => handleVariantChange(idx, "price", e.target.value)}
                  placeholder="150"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #e5e7eb",
                    fontSize: "14px",
                    outline: "none",
                    color: "#111827",
                  }}
                />
              </div>

              <div style={{ paddingTop: idx === 0 ? "20px" : "0" }}>
                {portions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeVariantRow(idx)}
                    title="Delete variant"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#9ca3af",
                      padding: "8px",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    🗑
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addVariantRow}
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: "10px",
            padding: "8px 16px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            color: "#374151",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          ＋ Add Variant
        </button>
      </section>

      {/* Card 4: Visibility */}
      <section
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          border: "1px solid #e5e7eb",
          padding: "24px",
          marginBottom: "20px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        }}
      >
        <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 4px 0" }}>Visibility</h2>
        <p style={{ margin: "0 0 20px 0", color: "#6b7280", fontSize: "13px" }}>
          Control how this dish appears on the public menu.
        </p>

        {/* Toggle 1: Available */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "18px", borderBottom: "1px solid #f3f4f6" }}>
          <div>
            <strong style={{ fontSize: "14px", display: "block", color: "#111827" }}>Available</strong>
            <span style={{ fontSize: "13px", color: "#6b7280" }}>
              Show this dish as orderable on the public menu.
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={available}
            onClick={() => {
              setAvailable(!available);
              if (!available) setSoldOut(false);
            }}
            style={{
              width: "48px",
              height: "26px",
              borderRadius: "9999px",
              background: available ? "#111827" : "#e5e7eb",
              border: "none",
              position: "relative",
              cursor: "pointer",
              transition: "background-color 0.2s ease",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: "3px",
                left: available ? "25px" : "3px",
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: "#ffffff",
                transition: "left 0.2s ease",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }}
            />
          </button>
        </div>

        {/* Toggle 2: Sold Out */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 0", borderBottom: "1px solid #f3f4f6" }}>
          <div>
            <strong style={{ fontSize: "14px", display: "block", color: "#111827" }}>Sold Out</strong>
            <span style={{ fontSize: "13px", color: "#6b7280" }}>
              Temporarily hide from ordering while still showing on the menu (e.g. ran out mid-day). Dish stays visible to customers, marked as sold out.
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={soldOut}
            onClick={() => {
              setSoldOut(!soldOut);
              if (!soldOut) setAvailable(false);
            }}
            style={{
              width: "48px",
              height: "26px",
              borderRadius: "9999px",
              background: soldOut ? "#111827" : "#e5e7eb",
              border: "none",
              position: "relative",
              cursor: "pointer",
              transition: "background-color 0.2s ease",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: "3px",
                left: soldOut ? "25px" : "3px",
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: "#ffffff",
                transition: "left 0.2s ease",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }}
            />
          </button>
        </div>

        {/* Toggle 3: Featured */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "18px" }}>
          <div>
            <strong style={{ fontSize: "14px", display: "block", color: "#111827" }}>Featured</strong>
            <span style={{ fontSize: "13px", color: "#6b7280" }}>
              Highlight this dish in the Featured Dishes section.
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={featured}
            onClick={() => setFeatured(!featured)}
            style={{
              width: "48px",
              height: "26px",
              borderRadius: "9999px",
              background: featured ? "#111827" : "#e5e7eb",
              border: "none",
              position: "relative",
              cursor: "pointer",
              transition: "background-color 0.2s ease",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: "3px",
                left: featured ? "25px" : "3px",
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: "#ffffff",
                transition: "left 0.2s ease",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }}
            />
          </button>
        </div>
      </section>

      {/* Card 5: Image Banner */}
      <section
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          border: "1px solid #e5e7eb",
          padding: "24px",
          marginBottom: "28px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        }}
      >
        <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 4px 0" }}>Image</h2>
        <p style={{ margin: "0 0 16px 0", color: "#6b7280", fontSize: "13px" }}>
          Upload a photo of the dish.
        </p>

        {/* Banner Preview */}
        <div
          style={{
            width: "100%",
            height: "240px",
            borderRadius: "12px",
            overflow: "hidden",
            position: "relative",
            background: "#f3f4f6",
          }}
        >
          <img
            src={imageUrl}
            alt={name || "Dish photo"}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).src = "https://images.deliveryhero.io/image/fd-pk/Products/34140436.jpg?width=1200";
            }}
          />

          <button
            type="button"
            onClick={() => {
              setCustomImageInput(imageUrl);
              setShowReplaceModal(true);
            }}
            style={{
              position: "absolute",
              right: "16px",
              bottom: "16px",
              background: "#ffffff",
              color: "#111827",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              padding: "7px 18px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
            }}
          >
            Replace
          </button>
        </div>
      </section>

      {/* Modal for Replace Image */}
      {showReplaceModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 9999,
            display: "grid",
            placeItems: "center",
            padding: "20px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowReplaceModal(false);
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "24px",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <h3 style={{ margin: "0 0 6px 0", fontSize: "17px", fontWeight: 700 }}>Update Dish Image</h3>
            <p style={{ margin: "0 0 16px 0", color: "#6b7280", fontSize: "13px" }}>
              Paste an image URL or choose a file from your computer.
            </p>

            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
              Image URL
            </label>
            <input
              type="url"
              value={customImageInput}
              onChange={(e) => setCustomImageInput(e.target.value)}
              placeholder="https://images.deliveryhero.io/..."
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
                fontSize: "13px",
                marginBottom: "16px",
              }}
            />

            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
              Or Upload Image File
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{
                width: "100%",
                fontSize: "13px",
                marginBottom: "20px",
              }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setShowReplaceModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  color: "#6b7280",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (customImageInput.trim()) setImageUrl(customImageInput.trim());
                  setShowReplaceModal(false);
                }}
                style={{
                  background: "#111827",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 18px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Apply Image
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sticky Action Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: "14px",
          marginTop: "16px",
        }}
      >
        <button
          type="button"
          onClick={() => setView("list")}
          style={{
            background: "none",
            border: "none",
            color: "#4b5563",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            padding: "10px 18px",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => void handleSaveDish()}
          style={{
            background: "#111827",
            color: "#ffffff",
            border: "none",
            borderRadius: "9999px",
            padding: "11px 26px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          }}
        >
          {isSubmitting ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
