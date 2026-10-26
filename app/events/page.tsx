"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Brand } from "../components/AuthShell";
import { RoleSwitcher } from "../components/RoleSwitcher";
import { useSessionRole } from "@/lib/useSessionRole";
import {
  AlertIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  MapPinIcon,
  PlusIcon,
  SparkIcon,
  TagIcon,
  TicketIcon,
  TrashIcon,
  UsersIcon,
  XCircleIcon,
} from "../components/icons";
import { StoredEvent } from "../api/events/store";

type ConfirmModal =
  | { type: "cancel"; event: StoredEvent }
  | { type: "delete"; event: StoredEvent }
  | null;

export default function EventsDirectoryPage() {
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useSessionRole();
  const [tab, setTab] = useState<"organizer" | "all">("all");
  const [search, setSearch] = useState("");
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set());
  const [registerErrors, setRegisterErrors] = useState<Record<string, string>>({});

  function loadEvents() {
    setLoading(true);
    // FR-006a: "All Events" tab always requests active=true (no cancelled events shown)
    const url =
      tab === "organizer"
        ? "/api/events?organizer=me"
        : "/api/events?active=true";
    fetch(url, { headers: { "x-user-role": role } })
      .then((res) => res.json())
      .then((data) => {
        if (data.events && Array.isArray(data.events)) {
          setEvents(data.events);
          // Seed from the server's own answer rather than assuming nothing
          // is registered — the server knows the real state (and for a
          // fresh fetch tied to the current role, it's the right identity
          // too, so a demo role switch can't leak a stale "Registered").
          setRegisteredIds(
            new Set(
              data.events
                .filter((e: StoredEvent) => e.registered)
                .map((e: StoredEvent) => e.id)
            )
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  // Participants have no events to create, so "My Created Events" isn't a
  // meaningful tab for them — bounce back to the directory if the role
  // changes out from under an open "organizer" tab (e.g. demo role switch).
  useEffect(() => {
    if (role !== "ORGANIZER" && tab === "organizer") {
      setTab("all");
    }
  }, [role, tab]);

  useEffect(() => {
    loadEvents();
    setRegisterErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, role]);

  const filteredEvents = useMemo(() => {
    if (!search.trim()) return events;
    const q = search.toLowerCase();
    return events.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.venue.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q)
    );
  }, [events, search]);

  // ── Cancel action ─────────────────────────────────────────────────────────
  async function handleCancel(event: StoredEvent) {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error ?? "Failed to cancel event");
        return;
      }
      // Optimistically update the status in state
      setEvents((prev) =>
        prev.map((e) =>
          e.id === event.id ? { ...e, status: "CANCELLED" } : e
        )
      );
      setConfirmModal(null);
    } catch {
      setActionError("An error occurred. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  // ── Register action (quick-register straight from the directory card) ──────
  async function handleRegister(event: StoredEvent) {
    setRegisteringId(event.id);
    setRegisterErrors((prev) => ({ ...prev, [event.id]: "" }));
    try {
      const res = await fetch(`/api/events/${event.id}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 409 from this endpoint only ever means "already registered" —
        // matching on status alone avoids drifting out of sync with the
        // server's exact error wording.
        if (res.status === 409) {
          setRegisteredIds((prev) => new Set(prev).add(event.id));
          return;
        }
        setRegisterErrors((prev) => ({ ...prev, [event.id]: data.error || "Registration failed" }));
        return;
      }
      setRegisteredIds((prev) => new Set(prev).add(event.id));
    } catch {
      setRegisterErrors((prev) => ({ ...prev, [event.id]: "Network error. Please try again." }));
    } finally {
      setRegisteringId(null);
    }
  }

  // ── Delete action ─────────────────────────────────────────────────────────
  async function handleDelete(event: StoredEvent) {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: "DELETE",
        headers: { "x-user-role": role },
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error ?? "Failed to delete event");
        return;
      }
      // Remove from state
      setEvents((prev) => prev.filter((e) => e.id !== event.id));
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
          <RoleSwitcher onRoleChange={(r) => setRole(r)} />
          {role === "ORGANIZER" && (
            <Link href="/events/create" className="btn btn-primary">
              <PlusIcon size={16} /> Create Event
            </Link>
          )}
        </div>
      </header>

      <main className="events-directory-container">
        <div className="directory-header">
          <div>
            <span className="badge badge-primary">Event Directory</span>
            <h1>{tab === "organizer" ? "My Organizer Events" : "All Active Events"}</h1>
            <p className="lede">
              {tab === "organizer"
                ? "Manage and monitor your published events — cancel or remove events that are no longer needed."
                : "Browse all upcoming active events across clubs, departments, and organizations."}
            </p>
          </div>

          {role === "ORGANIZER" && (
            <div className="directory-cta">
              <Link href="/events/create" className="btn btn-primary btn-lg">
                <PlusIcon size={18} /> Create New Event
              </Link>
            </div>
          )}
        </div>

        {/* Tab & Search Filter Bar */}
        <div className="directory-toolbar">
          <div className="tabs" role="tablist" aria-label="Event views">
            {role === "ORGANIZER" && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "organizer"}
                onClick={() => setTab("organizer")}
                className={`tab-btn ${tab === "organizer" ? "active" : ""}`}
              >
                My Created Events
              </button>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={tab === "all"}
              onClick={() => setTab("all")}
              className={`tab-btn ${tab === "all" ? "active" : ""}`}
            >
              All Active Events
            </button>
          </div>

          <div className="search-wrap">
            <input
              type="search"
              placeholder="Filter by name, category, or venue..."
              className="input search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Filter events"
            />
          </div>
        </div>

        {/* Event List */}
        {loading ? (
          <div className="loading-state">
            <span className="spinner" /> Loading events...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="empty-state-card">
            <TicketIcon size={44} />
            <h3>No events found</h3>
            <p>
              {tab === "organizer"
                ? "You haven't created any events yet. Publish your first event to get started!"
                : "No active events found. Try adjusting your search query."}
            </p>
            {role === "ORGANIZER" && (
              <Link href="/events/create" className="btn btn-primary">
                <PlusIcon size={16} /> Create Your First Event
              </Link>
            )}
          </div>
        ) : (
          <div className="event-cards-grid">
            {filteredEvents.map((event) => (
              <article key={event.id} className={`event-item-card${event.status === "CANCELLED" ? " event-card-cancelled" : ""}`}>
                <div className="card-top-row">
                  <span className="category-pill">
                    <TagIcon size={12} /> {event.category}
                  </span>
                  <span
                    className={`status-pill ${
                      event.status === "ACTIVE" ? "status-active" : "status-cancelled"
                    }`}
                  >
                    {event.status}
                  </span>
                </div>

                <h2 className="card-event-title">{event.name}</h2>
                <p className="card-event-desc">{event.description}</p>

                <div className="card-event-meta">
                  <div className="meta-row">
                    <CalendarIcon size={15} />
                    <span>{event.date}</span>
                  </div>
                  <div className="meta-row">
                    <ClockIcon size={15} />
                    <span>{event.time}</span>
                  </div>
                  <div className="meta-row">
                    <MapPinIcon size={15} />
                    <span>{event.venue}</span>
                  </div>
                  <div className="meta-row">
                    <UsersIcon size={15} />
                    <span>
                      Capacity: <strong>{event.capacity} seats</strong>
                      {event.remainingSeats !== undefined && (
                        <>
                          {" "}
                          —{" "}
                          {event.isFull ? (
                            <strong style={{ color: "var(--danger)" }}>Full</strong>
                          ) : (
                            <strong>{event.remainingSeats} left</strong>
                          )}
                        </>
                      )}
                    </span>
                  </div>
                </div>

                <div className="card-foot">
                  <span className="organizer-tag">
                    Organizer: <strong>{event.organizerName}</strong>
                  </span>

                  {/* FR-007: quick-register straight from the directory card */}
                  {tab === "all" && event.status === "ACTIVE" && (
                    <div className="card-actions">
                      {registeredIds.has(event.id) ? (
                        <span
                          className="btn btn-sm"
                          aria-live="polite"
                          style={{ background: "var(--success-soft)", color: "var(--success)" }}
                        >
                          <CheckIcon size={14} /> Registered
                        </span>
                      ) : event.isFull ? (
                        <span
                          className="btn btn-sm"
                          style={{ opacity: 0.6, cursor: "not-allowed" }}
                          aria-disabled="true"
                        >
                          Event Full
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={registeringId === event.id}
                          onClick={() => handleRegister(event)}
                          aria-label={`Register for event: ${event.name}`}
                        >
                          {registeringId === event.id ? (
                            <><span className="spinner" /> Registering...</>
                          ) : (
                            <><SparkIcon size={14} /> Register</>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                  {registerErrors[event.id] && (
                    <p className="field-error" role="alert" style={{ width: "100%", marginTop: "0.5rem" }}>
                      <AlertIcon size={14} />
                      <span>{registerErrors[event.id]}</span>
                    </p>
                  )}

                  {/* FR-005a: Cancel / Delete actions — only for owning organizer */}
                  {role === "ORGANIZER" && tab === "organizer" && (
                    <div className="card-actions">
                      {event.status === "ACTIVE" && (
                        <button
                          type="button"
                          className="btn btn-sm btn-warning"
                          onClick={() => {
                            setActionError(null);
                            setConfirmModal({ type: "cancel", event });
                          }}
                          aria-label={`Cancel event: ${event.name}`}
                        >
                          <XCircleIcon size={14} /> Cancel
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          setActionError(null);
                          setConfirmModal({ type: "delete", event });
                        }}
                        aria-label={`Delete event: ${event.name}`}
                      >
                        <TrashIcon size={14} /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* ── Confirmation Modal ─────────────────────────────────────────────── */}
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
            <div className={`modal-icon ${confirmModal.type === "delete" ? "modal-icon-danger" : "modal-icon-warning"}`}>
              {confirmModal.type === "delete" ? (
                <TrashIcon size={28} />
              ) : (
                <XCircleIcon size={28} />
              )}
            </div>

            <h2 id="confirm-modal-title" className="modal-title">
              {confirmModal.type === "cancel"
                ? "Cancel this event?"
                : "Delete this event?"}
            </h2>

            <p className="modal-desc">
              {confirmModal.type === "cancel" ? (
                <>
                  <strong>&quot;{confirmModal.event.name}&quot;</strong> will be marked as{" "}
                  <strong>Cancelled</strong>. It will stop accepting new registrations and will
                  no longer appear in the active events listing for participants.
                </>
              ) : (
                <>
                  <strong>&quot;{confirmModal.event.name}&quot;</strong> will be{" "}
                  <strong>permanently deleted</strong> and cannot be recovered.
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
                onClick={() =>
                  confirmModal.type === "cancel"
                    ? handleCancel(confirmModal.event)
                    : handleDelete(confirmModal.event)
                }
              >
                {actionLoading ? (
                  <><span className="spinner" /> Processing...</>
                ) : confirmModal.type === "cancel" ? (
                  <><XCircleIcon size={16} /> Yes, Cancel Event</>
                ) : (
                  <><TrashIcon size={16} /> Yes, Delete Event</>
                )}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-md"
                disabled={actionLoading}
                onClick={() => setConfirmModal(null)}
              >
                Keep Event
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
