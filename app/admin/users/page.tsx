"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Brand } from "../../components/AuthShell";
import { AlertIcon, ShieldIcon, TrashIcon, UsersIcon } from "../../components/icons";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "ORGANIZER" | "PARTICIPANT";
  verified: boolean;
  suspended: boolean;
  createdAt: string;
}

type ConfirmModal =
  | { type: "suspend"; user: AdminUser }
  | { type: "unsuspend"; user: AdminUser }
  | { type: "delete"; user: AdminUser }
  | null;

type LoadState = "loading" | "unauthorized" | "forbidden" | "ready";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function loadUsers() {
    setLoadState("loading");
    fetch("/api/admin/users")
      .then(async (res) => {
        if (res.status === 401) {
          setLoadState("unauthorized");
          return;
        }
        if (res.status === 403) {
          setLoadState("forbidden");
          return;
        }
        const data = await res.json();
        setUsers(data.users ?? []);
        setLoadState("ready");
      })
      .catch(() => setLoadState("forbidden"));
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleConfirm() {
    if (!confirmModal) return;
    setActionLoading(true);
    setActionError(null);
    try {
      if (confirmModal.type === "delete") {
        const res = await fetch(`/api/admin/users/${confirmModal.user.id}`, { method: "DELETE" });
        if (!res.ok && res.status !== 204) {
          const data = await res.json().catch(() => ({}));
          setActionError(data.error ?? "Failed to delete user");
          return;
        }
        setUsers((prev) => prev.filter((u) => u.id !== confirmModal.user.id));
      } else {
        const action = confirmModal.type === "suspend" ? "suspend" : "unsuspend";
        const res = await fetch(`/api/admin/users/${confirmModal.user.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setActionError(data.error ?? "Failed to update user");
          return;
        }
        setUsers((prev) => prev.map((u) => (u.id === data.user.id ? data.user : u)));
      }
      setConfirmModal(null);
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
          <Link href="/events" className="btn btn-ghost">
            Back to events
          </Link>
        </div>
      </header>

      <main className="events-directory-container">
        <div className="directory-header">
          <div>
            <span className="badge badge-primary">FR-003c • Admin</span>
            <h1>Manage user accounts</h1>
            <p className="lede">View every account, suspend access, or remove one permanently.</p>
          </div>
          {/* FR-006c */}
          <div className="directory-cta">
            <Link href="/admin/categories" className="btn btn-ghost">
              Manage categories
            </Link>
          </div>
        </div>

        {loadState === "loading" && (
          <div className="loading-state">
            <span className="spinner" /> Loading users...
          </div>
        )}

        {loadState === "unauthorized" && (
          <div className="empty-state-card">
            <AlertIcon size={32} />
            <h3>Not signed in</h3>
            <p>You need to be logged in with an admin account to manage users.</p>
            <Link href="/login" className="btn btn-primary">Log in</Link>
          </div>
        )}

        {loadState === "forbidden" && (
          <div className="empty-state-card">
            <ShieldIcon size={32} />
            <h3>Access denied</h3>
            <p>Only admin accounts can manage users here.</p>
          </div>
        )}

        {loadState === "ready" && (
          <div className="event-cards-grid" style={{ gridTemplateColumns: "1fr" }}>
            <div
              className="card"
              style={{
                background: "var(--surface)",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border)",
                overflow: "hidden",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "0.75rem 1rem" }}>Name</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Email</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Role</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Status</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <UsersIcon size={14} />
                          {u.name}
                        </div>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", color: "var(--text-muted)" }}>{u.email}</td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <span className="badge">{u.role}</span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        {u.suspended ? (
                          <span className="status-pill status-cancelled">Suspended</span>
                        ) : u.verified ? (
                          <span className="status-pill status-active">Active</span>
                        ) : (
                          <span className="badge">Unverified</span>
                        )}
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <div className="card-actions">
                          {u.suspended ? (
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => {
                                setActionError(null);
                                setConfirmModal({ type: "unsuspend", user: u });
                              }}
                            >
                              Unsuspend
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm btn-warning"
                              onClick={() => {
                                setActionError(null);
                                setConfirmModal({ type: "suspend", user: u });
                              }}
                            >
                              Suspend
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => {
                              setActionError(null);
                              setConfirmModal({ type: "delete", user: u });
                            }}
                            aria-label={`Delete account: ${u.name}`}
                          >
                            <TrashIcon size={14} /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {confirmModal && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmModal(null);
          }}
        >
          <div className="modal-card">
            <div
              className={`modal-icon ${confirmModal.type === "delete" ? "modal-icon-danger" : "modal-icon-warning"}`}
            >
              {confirmModal.type === "delete" ? <TrashIcon size={28} /> : <ShieldIcon size={28} />}
            </div>

            <h2 id="confirm-modal-title" className="modal-title">
              {confirmModal.type === "delete"
                ? "Delete this account?"
                : confirmModal.type === "suspend"
                  ? "Suspend this account?"
                  : "Restore this account?"}
            </h2>

            <p className="modal-desc">
              {confirmModal.type === "delete" && (
                <>
                  <strong>{confirmModal.user.name}</strong>&apos;s account (
                  {confirmModal.user.email}) will be <strong>permanently deleted</strong> and
                  cannot be recovered.
                </>
              )}
              {confirmModal.type === "suspend" && (
                <>
                  <strong>{confirmModal.user.name}</strong> will immediately lose access — any
                  active session is blocked on their very next request.
                </>
              )}
              {confirmModal.type === "unsuspend" && (
                <>
                  <strong>{confirmModal.user.name}</strong> will regain access immediately.
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
                className={`btn ${confirmModal.type === "delete" ? "btn-danger" : "btn-warning"} btn-md`}
                disabled={actionLoading}
                onClick={handleConfirm}
              >
                {actionLoading ? (
                  <><span className="spinner" /> Processing...</>
                ) : confirmModal.type === "delete" ? (
                  <><TrashIcon size={16} /> Yes, Delete Account</>
                ) : confirmModal.type === "suspend" ? (
                  "Yes, Suspend"
                ) : (
                  "Yes, Restore"
                )}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-md"
                disabled={actionLoading}
                onClick={() => setConfirmModal(null)}
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
