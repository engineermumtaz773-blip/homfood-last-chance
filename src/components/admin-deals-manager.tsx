"use client";

import { useState, type FormEvent } from "react";
import { useDeals, type Deal } from "@/components/deals-provider";

export function AdminDealsManager() {
  const { deals, loading, addDeal, removeDeal } = useDeals();
  const [statusMessage, setStatusMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);

  // Form states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [regularPrice, setRegularPrice] = useState("");
  const [discountedPrice, setDiscountedPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  function startEdit(deal: Deal) {
    setEditingDeal(deal);
    setTitle(deal.title);
    setDescription(deal.description);
    setRegularPrice(String(deal.regularPrice));
    setDiscountedPrice(String(deal.discountedPrice));
    setImageUrl(deal.imageUrl || "");
    setStatusMessage({ text: `Editing deal #${deal.id}: "${deal.title}"` });
  }

  function cancelEdit() {
    setEditingDeal(null);
    setTitle("");
    setDescription("");
    setRegularPrice("");
    setDiscountedPrice("");
    setImageUrl("");
    setStatusMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reg = Number(regularPrice);
    const disc = Number(discountedPrice);

    if (!title.trim() || !description.trim()) {
      setStatusMessage({ text: "Please enter a valid deal title and description.", error: true });
      return;
    }

    if (!Number.isFinite(reg) || !Number.isFinite(disc) || reg <= 0 || disc <= 0) {
      setStatusMessage({ text: "Prices must be positive numbers in PKR.", error: true });
      return;
    }

    if (disc >= reg) {
      setStatusMessage({ text: "Discounted price must be strictly lower than regular price.", error: true });
      return;
    }

    if (imageUrl.trim()) {
      try {
        const u = new URL(imageUrl.trim());
        if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
      } catch {
        setStatusMessage({ text: "Image URL must be a valid HTTP or HTTPS address.", error: true });
        return;
      }
    }

    setIsSubmitting(true);
    setStatusMessage({ text: "Saving deal to store database..." });

    try {
      const saved = await addDeal({
        id: editingDeal ? editingDeal.id : undefined,
        title: title.trim(),
        description: description.trim(),
        regularPrice: reg,
        discountedPrice: disc,
        imageUrl: imageUrl.trim(),
      });

      if (saved) {
        setStatusMessage({
          text: editingDeal
            ? `Successfully updated deal #${saved.id} ("${saved.title}") in database!`
            : `Successfully added "${saved.title}" (PKR ${saved.discountedPrice}) to database!`,
        });
        cancelEdit();
      } else {
        setStatusMessage({ text: "Failed to persist deal to database. Please try again.", error: true });
      }
    } catch (err) {
      console.error(err);
      setStatusMessage({ text: "An error occurred while communicating with the database.", error: true });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: number, dealTitle: string) {
    if (!window.confirm(`Are you sure you want to remove "${dealTitle}" from the store database?`)) {
      return;
    }
    const success = await removeDeal(id);
    if (success) {
      setStatusMessage({ text: `Deal "${dealTitle}" was deleted from database.` });
      if (editingDeal?.id === id) cancelEdit();
    } else {
      setStatusMessage({ text: `Could not delete deal #${id}.`, error: true });
    }
  }

  return (
    <section className="admin-panel admin-deals-panel" aria-labelledby="admin-deals-heading">
      <div className="admin-panel-heading">
        <div>
          <h2 id="admin-deals-heading">Manage Daily Deals (Database)</h2>
          <p>Deals saved here are stored in the database and appear dynamically on /daily-deals.</p>
        </div>
      </div>

      <form className="admin-deal-form" onSubmit={handleSubmit} style={{ background: "var(--surface)", padding: "18px", borderRadius: "12px", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <strong style={{ fontSize: "15px" }}>{editingDeal ? `Edit Deal #${editingDeal.id}` : "Create New Daily Deal"}</strong>
          {editingDeal && (
            <button type="button" onClick={cancelEdit} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", textDecoration: "underline", fontSize: "13px" }}>
              Cancel edit
            </button>
          )}
        </div>

        <label className="field">
          Deal title
          <input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={70}
            placeholder="e.g. Homestyle Lunch Combo"
          />
        </label>

        <label className="field">
          Description
          <textarea
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            maxLength={220}
            rows={2}
            placeholder="e.g. Chicken Biryani with a refreshing drink and salad."
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <label className="field">
            Regular price (PKR)
            <input
              name="regularPrice"
              type="number"
              min="2"
              step="1"
              value={regularPrice}
              onChange={(e) => setRegularPrice(e.target.value)}
              required
              placeholder="e.g. 400"
            />
          </label>

          <label className="field">
            Discounted price (PKR)
            <input
              name="discountedPrice"
              type="number"
              min="1"
              step="1"
              value={discountedPrice}
              onChange={(e) => setDiscountedPrice(e.target.value)}
              required
              placeholder="e.g. 350"
            />
          </label>
        </div>

        <label className="field admin-deal-image-field">
          Image URL
          <input
            name="imageUrl"
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://images.unsplash.com/photo-..."
          />
        </label>

        <button className="add-button" type="submit" disabled={isSubmitting} style={{ marginTop: "10px" }}>
          {isSubmitting ? "Saving to Database..." : editingDeal ? "Update Deal in DB" : "Save Deal to DB"}
        </button>
      </form>

      {statusMessage && (
        <p
          className="admin-deal-message"
          role="status"
          aria-live="polite"
          style={{
            color: statusMessage.error ? "#ef4444" : "#10b981",
            marginTop: "12px",
            fontWeight: 500,
          }}
        >
          {statusMessage.text}
        </p>
      )}

      <div style={{ marginTop: "24px" }}>
        <h3 style={{ fontSize: "15px", marginBottom: "12px" }}>
          Live Deals in Database ({deals.length})
        </h3>
        {loading && <p style={{ color: "var(--muted)", fontSize: "14px" }}>Loading deals from database...</p>}
        {!loading && deals.length === 0 && (
          <p style={{ color: "var(--muted)", fontSize: "14px" }}>No daily deals currently in database.</p>
        )}
        <div className="admin-deal-list">
          {deals.map((deal) => (
            <div className="admin-deal-row" key={deal.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
              <div>
                <strong>{deal.title}</strong>
                <p style={{ margin: "2px 0", fontSize: "13px", color: "var(--muted)" }}>{deal.description}</p>
                <small style={{ color: "var(--primary)", fontWeight: 600 }}>
                  Rs. {deal.discountedPrice} (Save Rs. {deal.regularPrice - deal.discountedPrice}) · Reg. Rs. {deal.regularPrice}
                </small>
              </div>
              <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => startEdit(deal)}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(deal.id, deal.title)}
                  style={{
                    background: "rgba(239, 68, 68, 0.1)",
                    color: "#ef4444",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                  aria-label={`Remove ${deal.title}`}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
