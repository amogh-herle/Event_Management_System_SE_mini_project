"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Brand } from "../../components/AuthShell";
import { AlertIcon, CheckIcon, PlusIcon, ShieldIcon, TagIcon, TrashIcon } from "../../components/icons";

interface AdminCategory {
  id: string;
  name: string;
  createdAt: string;
  eventCount: number;
}

type LoadState = "loading" | "unauthorized" | "forbidden" | "error" | "ready";

// FR-006c: admin adds, renames, and removes event categories.
export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "danger"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminCategory | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function sortByName(list: AdminCategory[]) {
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }

  function loadCategories() {
    setLoadState("loading");
    fetch("/api/admin/categories")
      .then(async (res) => {
        if (res.status === 401) {
          setLoadState("unauthorized");
          return;
        }
        if (res.status === 403) {
          setLoadState("forbidden");
          return;
        }
        if (!res.ok) {
          setLoadState("error");
          return;
        }
        const data = await res.json();
        setCategories(data.categories ?? []);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }

  useEffect(() => {
    loadCategories();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const name = newName.trim();
    if (!name) {
      setMessage({ type: "danger", text: "Category name is required" });
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "danger", text: data.error ?? "Failed to add category" });
        return;
      }
      setCategories((prev) => sortByName([...prev, data.category]));
      setNewName("");
      setMessage({ type: "success", text: `Category "${data.category.name}" added.` });
    } catch {
      setMessage({ type: "danger", text: "An error occurred. Please try again." });
    } finally {
      setAdding(false);
    }
  }

  async function handleRename(category: AdminCategory) {
    setMessage(null);
    const name = editName.trim();
    if (!name) {
      setMessage({ type: "danger", text: "Category name is required" });
      return;
    }
    if (name === category.name) {
      setEditingId(null);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "danger", text: data.error ?? "Failed to rename category" });
        return;
      }
      setCategories((prev) => sortByName(prev.map((c) => (c.id === category.id ? data.category : c))));
      setEditingId(null);
      setMessage({
        type: "success",
        text:
          data.category.eventCount > 0
            ? `Renamed to "${data.category.name}" — ${data.category.eventCount} event${data.category.eventCount === 1 ? "" : "s"} updated.`
            : `Renamed to "${data.category.name}".`,
      });
    } catch {
      setMessage({ type: "danger", text: "An error occurred. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/categories/${confirmDelete.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error ?? "Failed to remove category");
        return;
      }
      setCategories((prev) => prev.filter((c) => c.id !== confirmDelete.id));
      setMessage({ type: "success", text: `Category "${confirmDelete.name}" removed.` });
      setConfirmDelete(null);
    } catch {
      setActionError("An error occurred. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="events-directory-page">
      <header className="nav event-nav">
        <Brand />
        <div className="event-nav-actions">
          <Link href="/admin/users" className="btn btn-ghost">
            Manage users
          </Link>
          <Link href="/events" className="btn btn-ghost">
            Back to events
          </Link>
        </div>
      </header>

      <main className="events-directory-container">
        <div className="directory-header">
          <div>
            <span className="badge badge-primary">FR-006c • Admin</span>
            <h1>Manage event categories</h1>
            <p className="lede">
              Add, rename, or remove the categories organizers choose from. Changes apply across
              the platform immediately.
            </p>
          </div>
        </div>

        {loadState === "loading" && (
          <div className="loading-state">
            <span className="spinner" /> Loading categories...
          </div>
        )}

        {loadState === "unauthorized" && (
          <div className="empty-state-card">
            <AlertIcon size={32} />
            <h3>Not signed in</h3>
            <p>You need to be logged in with an admin account to manage categories.</p>
            <Link href="/login" className="btn btn-primary">Log in</Link>
          </div>
        )}

        {loadState === "forbidden" && (
          <div className="empty-state-card">
            <ShieldIcon size={32} />
            <h3>Access denied</h3>
            <p>Only admin accounts can manage categories here.</p>
          </div>
        )}

        {loadState === "error" && (
          <div className="empty-state-card">
            <AlertIcon size={32} />
            <h3>Couldn&apos;t load categories</h3>
            <p>Something went wrong while loading the category list.</p>
            <button type="button" className="btn btn-primary" onClick={loadCategories}>
              Try again
            </button>
          </div>
        )}

        {loadState === "ready" && (
          <>
            {message && (
              <div className={`banner-alert banner-${message.type}`} role={message.type === "danger" ? "alert" : "status"}>
                {message.type === "success" ? <CheckIcon size={18} /> : <AlertIcon size={18} />}
                <span>{message.text}</span>
              </div>
            )}

            <form
              onSubmit={handleAdd}
              noValidate
              style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "24px", maxWidth: "560px" }}
            >
              <input
                type="text"
                className="input search-input"
                placeholder="New category name, e.g. Robotics"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                aria-label="New category name"
                maxLength={100}
                style={{ flex: "1 1 260px" }}
              />
              <button type="submit" className="btn btn-primary" disabled={adding}>
                {adding ? (
                  <><span className="spinner" /> Adding...</>
                ) : (
                  <><PlusIcon size={16} /> Add category</>
                )}
              </button>
            </form>

            {categories.length === 0 ? (
              <div className="empty-state-card">
                <TagIcon size={32} />
                <h3>No categories yet</h3>
                <p>
                  Until you add one, organizers choose from the built-in default list. Once you add
                  a category, the event forms show the categories managed here.
                </p>
              </div>
            ) : (
              <div className="event-cards-grid" style={{ gridTemplateColumns: "1fr" }}>
                <div
                  className="card"
                  style={{
                    background: "var(--surface)",
                    borderRadius: "var(--radius-lg)",
                    border: "1px solid var(--border)",
                    overflowX: "auto",
                  }}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                        <th style={{ padding: "0.75rem 1rem" }}>Category</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Events</th>
                        <th style={{ padding: "0.75rem 1rem" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((c) => (
                        <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "0.75rem 1rem" }}>
                            {editingId === c.id ? (
                              <input
                                type="text"
                                className="input search-input"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleRename(c);
                                  if (e.key === "Escape") setEditingId(null);
                                }}
                                aria-label={`New name for ${c.name}`}
                                maxLength={100}
                                autoFocus
                              />
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <TagIcon size={14} />
                                {c.name}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", color: "var(--text-muted)" }}>
                            {c.eventCount}
                          </td>
                          <td style={{ padding: "0.75rem 1rem" }}>
                            <div className="card-actions">
                              {editingId === c.id ? (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-primary"
                                    disabled={saving}
                                    onClick={() => handleRename(c)}
                                  >
                                    {saving ? <><span className="spinner" /> Saving...</> : "Save"}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-ghost"
                                    disabled={saving}
                                    onClick={() => setEditingId(null)}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-sm"
                                    onClick={() => {
                                      setMessage(null);
                                      setEditingId(c.id);
                                      setEditName(c.name);
                                    }}
                                    aria-label={`Rename category: ${c.name}`}
                                  >
                                    Rename
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-danger"
                                    onClick={() => {
                                      setActionError(null);
                                      setConfirmDelete(c);
                                    }}
                                    aria-label={`Remove category: ${c.name}`}
                                  >
                                    <TrashIcon size={14} /> Remove
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {confirmDelete && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDelete(null);
          }}
        >
          <div className="modal-card">
            <div className="modal-icon modal-icon-danger">
              <TrashIcon size={28} />
            </div>

            <h2 id="confirm-modal-title" className="modal-title">
              Remove this category?
            </h2>

            <p className="modal-desc">
              {confirmDelete.eventCount > 0 ? (
                <>
                  <strong>{confirmDelete.name}</strong> is used by {confirmDelete.eventCount} event
                  {confirmDelete.eventCount === 1 ? "" : "s"}, so it can&apos;t be removed. Rename it
                  instead, or remove it once no events use it.
                </>
              ) : (
                <>
                  <strong>{confirmDelete.name}</strong> will no longer be offered to organizers.
                  No events use it.
                </>
              )}
            </p>

            {actionError && (
              <div className="banner-alert banner-danger" role="alert">
                <AlertIcon size={16} />
                <span>{actionError}</span>
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-danger btn-md"
                disabled={actionLoading || confirmDelete.eventCount > 0}
                onClick={handleDelete}
              >
                {actionLoading ? (
                  <><span className="spinner" /> Processing...</>
                ) : (
                  <><TrashIcon size={16} /> Yes, Remove Category</>
                )}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-md"
                disabled={actionLoading}
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
