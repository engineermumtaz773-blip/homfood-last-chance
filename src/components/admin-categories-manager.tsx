"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function AdminCategoriesManager() {
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCatName, setNewCatName] = useState("");
  const [editingCat, setEditingCat] = useState<{ oldName: string; newName: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    let mounted = true;
    async function fetchCategories() {
      try {
        const res = await fetch("/api/categories", { cache: "no-store" });
        if (!res.ok) throw new Error("Could not load categories");
        const data = await res.json();
        if (mounted && Array.isArray(data.categories)) {
          setCategories(data.categories);
        }
      } catch (err) {
        console.error(err);
        if (mounted) setToast({ message: "Failed to load categories from database.", type: "error" });
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void fetchCategories();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    if (categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setToast({ message: "This category already exists.", type: "error" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCategories(data.categories);
        setNewCatName("");
        setToast({ message: `Category "${trimmed}" added to database!`, type: "success" });
      } else {
        throw new Error(data.error || "Failed to add category");
      }
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Error adding category", type: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCat || !editingCat.newName.trim()) return;
    const trimmed = editingCat.newName.trim();

    setSubmitting(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, oldName: editingCat.oldName }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCategories(data.categories);
        setEditingCat(null);
        setToast({ message: `Category renamed to "${trimmed}" successfully!`, type: "success" });
      } else {
        throw new Error(data.error || "Failed to rename category");
      }
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Error updating category", type: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteCategory(name: string) {
    if (!window.confirm(`Are you sure you want to delete the category "${name}"?`)) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/categories?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCategories(data.categories);
        setToast({ message: `Category "${name}" deleted from database.`, type: "success" });
      } else {
        throw new Error(data.error || "Failed to delete category");
      }
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Error deleting category", type: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Toast Alert */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            style={{
              position: "fixed",
              top: 24,
              right: 24,
              zIndex: 99999,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 20px",
              borderRadius: 12,
              background: toast.type === "success" ? "#064e3b" : "#7f1d1d",
              color: "#fff",
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
              border: `1px solid ${toast.type === "success" ? "#10b981" : "#ef4444"}`,
              fontSize: 14,
            }}
          >
            <span>{toast.type === "success" ? "✓" : "⚠"}</span>
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ marginBottom: 24 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: "1px" }}>
          CATALOG STRUCTURE
        </span>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: "#111827", margin: "4px 0 0" }}>Menu Categories</h2>
        <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6b7280" }}>
          Organize your dishes into distinct searchable categories visible to customers across the storefront.
        </p>
      </div>

      {/* Add Category Card */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: 20, marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px", color: "#111827" }}>Add New Category</h3>
        <form onSubmit={handleAddCategory} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            type="text"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="e.g. Special Karahi, Desserts, Traditional Breads..."
            disabled={submitting}
            style={{ flex: 1, minWidth: 240, padding: "10px 14px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
          />
          <button
            type="submit"
            disabled={submitting || !newCatName.trim()}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              background: "#10b981",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              border: "none",
              cursor: submitting || !newCatName.trim() ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Adding..." : "＋ Add Category"}
          </button>
        </form>
      </div>

      {/* Categories List */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px", color: "#111827" }}>
          Active Categories ({categories.length})
        </h3>

        {loading ? (
          <div style={{ display: "grid", gap: 10 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ height: 48, borderRadius: 8, background: "#f3f4f6", animation: "pulse 1.5s infinite" }} />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <p style={{ color: "#6b7280", fontStyle: "italic", margin: 0 }}>No categories registered yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {categories.map((cat) => {
              const isEditing = editingCat?.oldName === cat;
              return (
                <div
                  key={cat}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 18px",
                    borderRadius: 10,
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  {isEditing ? (
                    <form onSubmit={handleUpdateCategory} style={{ display: "flex", gap: 8, flex: 1 }}>
                      <input
                        type="text"
                        value={editingCat.newName}
                        onChange={(e) => setEditingCat({ ...editingCat, newName: e.target.value })}
                        style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid #10b981", fontSize: 13 }}
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={submitting}
                        style={{ padding: "6px 12px", borderRadius: 6, background: "#10b981", color: "#fff", border: "none", fontSize: 12, cursor: "pointer" }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCat(null)}
                        style={{ padding: "6px 12px", borderRadius: 6, background: "#e5e7eb", color: "#374151", border: "none", fontSize: 12, cursor: "pointer" }}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 16 }}>◈</span>
                        <strong style={{ fontSize: 14, color: "#111827" }}>{cat}</strong>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => setEditingCat({ oldName: cat, newName: cat })}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 6,
                            background: "#fff",
                            border: "1px solid #d1d5db",
                            color: "#374151",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteCategory(cat)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 6,
                            background: "#fee2e2",
                            border: "1px solid #fecaca",
                            color: "#991b1b",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
