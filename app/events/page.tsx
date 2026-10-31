"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  | { type: "cancel_registration"; eventId: string; eventName: string; isWaitlist?: boolean }
  | null;

export default function EventsDirectoryPage() {
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useSessionRole();
  const [tab, setTab] = useState<"organizer" | "all" | "registrations">("all");
  const [search, setSearch] = useState("");
  // FR-006b: category/date/venue filters, applied server-side with the search
  const [filterCategory, setFilterCategory] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterVenue, setFilterVenue] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [debouncedVenue, setDebouncedVenue] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const eventsRequestId = useRef(0);
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set());
  const [waitlistedIds, setWaitlistedIds] = useState<Set<string>>(new Set());
  const [registerErrors, setRegisterErrors] = useState<Record<string, string>>({});
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [regLoading, setRegLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [registrantsModalEvent, setRegistrantsModalEvent] = useState<StoredEvent | null>(null);
  const [modalRegistrants, setModalRegistrants] = useState<any[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  function openRegistrantsModal(evt: StoredEvent) {
    setRegistrantsModalEvent(evt);
    setModalLoading(true);
    fetch(`/api/events/${evt.id}/export?format=json`, {
      headers: { "x-user-role": role },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.participants && Array.isArray(data.participants)) {
          setModalRegistrants(data.participants);
        } else {
          setModalRegistrants([]);
        }
      })
      .catch(() => setModalRegistrants([]))
      .finally(() => setModalLoading(false));
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "registrations") {
        setTab("registrations");
      }
    }
  }, []);

  function loadRegistrations() {
    setRegLoading(true);
    fetch("/api/registrations", { headers: { "x-user-role": role } })
      .then((res) => res.json())
      .then((data) => {
        if (data.registrations && Array.isArray(data.registrations)) {
          setRegistrations(data.registrations);
        }
      })
      .catch(() => {})
      .finally(() => setRegLoading(false));
  }

  // FR-006b: search (name only) + filters, sent as query params
  const filterQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
    if (filterCategory) params.set("category", filterCategory);
    if (filterDate) params.set("date", filterDate);
    if (debouncedVenue.trim()) params.set("venue", debouncedVenue.trim());
    return params.toString();
  }, [debouncedSearch, filterCategory, filterDate, debouncedVenue]);
  const hasActiveFilters = filterQuery !== "";

  function loadEvents() {
    setLoading(true);
    // Only the latest request may update the list, so a slow response for
    // an older search can't overwrite newer results.
    const requestId = ++eventsRequestId.current;
    // FR-006a: "All Events" tab always requests active=true (no cancelled events shown)
    const baseUrl =
      tab === "organizer"
        ? "/api/events?organizer=me"
        : "/api/events?active=true";
    const url = filterQuery ? `${baseUrl}&${filterQuery}` : baseUrl;
    fetch(url, { headers: { "x-user-role": role } })
      .then((res) => res.json())
      .then((data) => {
        if (requestId !== eventsRequestId.current) return;
        if (data.events && Array.isArray(data.events)) {
          setEvents(data.events);
          // Seed from the server's own answer rather than assuming nothing
          // is registered — the server knows the real state
          setRegisteredIds(
            new Set(
              data.events
                .filter((e: StoredEvent) => e.registered)
                .map((e: StoredEvent) => e.id)
            )
          );
          setWaitlistedIds(
            new Set(
              data.events
                .filter((e: StoredEvent) => e.waitlisted)
                .map((e: StoredEvent) => e.id)
            )
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        if (requestId === eventsRequestId.current) setLoading(false);
      });
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
    if (tab === "registrations") {
      loadRegistrations();
    } else {
      loadEvents();
    }
    setRegisterErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, role]);

  // FR-006b: debounce the free-text inputs so typing doesn't fire a request
  // per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedVenue(filterVenue), 300);
    return () => clearTimeout(t);
  }, [filterVenue]);

  // Reload when the search/filters change (tab/role changes are handled by
  // the effect above, which already uses the current filters).
  const filterQueryLoaded = useRef(filterQuery);
  useEffect(() => {
    if (filterQueryLoaded.current === filterQuery) return;
    filterQueryLoaded.current = filterQuery;
    if (tab !== "registrations") loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterQuery]);

  useEffect(() => {
    fetch("/api/categories")
      .then((res) => res.json())
      .then((data) => {
        if (data.categories && Array.isArray(data.categories)) {
          setCategories(data.categories);
        }
      })
      .catch(() => {});
  }, []);

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setFilterCategory("");
    setFilterDate("");
    setFilterVenue("");
    setDebouncedVenue("");
  }

  async function handleSelfCancellation(eventId: string, eventName: string, isWaitlist?: boolean) {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/registrations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || "Failed to cancel registration");
        return;
      }
      setConfirmModal(null);
      setFeedbackMsg({
        type: "success",
        text: isWaitlist
          ? `You have left the waitlist for "${eventName}".`
          : data.promotedRegistration
          ? `Your registration for "${eventName}" has been cancelled and your seat was given to the next person on the waitlist.`
          : `Your registration for "${eventName}" has been cancelled. A cancellation confirmation email has been sent.`,
      });
      setRegisteredIds((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
      setWaitlistedIds((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
      loadEvents();
      loadRegistrations();
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  // FR-006b: search and filters are applied by GET /api/events, so the
  // list returned by the server is already the filtered result.
  const filteredEvents = events;

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

  // ── Register / Waitlist action (quick-action straight from directory card) ─
  async function handleRegister(event: StoredEvent, waitlist = false) {
    setRegisteringId(event.id);
    setRegisterErrors((prev) => ({ ...prev, [event.id]: "" }));
    try {
      const res = await fetch(`/api/events/${event.id}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-role": role },
        body: JSON.stringify({ waitlist }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          if (data.registration?.status === "waitlisted" || data.error?.toLowerCase().includes("waitlist")) {
            setWaitlistedIds((prev) => new Set(prev).add(event.id));
          } else {
            setRegisteredIds((prev) => new Set(prev).add(event.id));
          }
          return;
        }
        setRegisterErrors((prev) => ({
          ...prev,
          [event.id]: data.error || (waitlist ? "Failed to join waitlist" : "Registration failed"),
        }));
        return;
      }

      if (data.status === "waitlisted") {
        setWaitlistedIds((prev) => new Set(prev).add(event.id));
      } else {
        setRegisteredIds((prev) => new Set(prev).add(event.id));
      }
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
            <h1>
              {tab === "organizer"
                ? "My Organizer Events"
                : tab === "registrations"
                ? "My Registrations"
                : "All Active Events"}
            </h1>
            <p className="lede">
              {tab === "organizer"
                ? "Manage and monitor your published events — cancel or remove events that are no longer needed."
                : tab === "registrations"
                ? "Review your confirmed tickets and waitlist positions, or cancel registrations."
                : "Browse all upcoming active events across clubs, departments, and organizations."}
            </p>
            {feedbackMsg && (
              <div
                className={`alert alert-${feedbackMsg.type === "success" ? "success" : "danger"}`}
                role="status"
                style={{ marginTop: "1rem" }}
              >
                <CheckIcon size={18} />
                <span>{feedbackMsg.text}</span>
              </div>
            )}
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
            <button
              type="button"
              role="tab"
              aria-selected={tab === "registrations"}
              onClick={() => setTab("registrations")}
              className={`tab-btn ${tab === "registrations" ? "active" : ""}`}
            >
              My Registrations
            </button>
          </div>

          <div className="search-wrap">
            <input
              type="search"
              placeholder="Search events by name..."
              className="input search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search events by name"
              maxLength={100}
            />
          </div>
        </div>

        {/* FR-006b: Category / Date / Venue filters */}
        {tab !== "registrations" && (
          <div
            role="group"
            aria-label="Filter events"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "12px",
              alignItems: "center",
              maxWidth: "820px",
              marginTop: "-8px",
              marginBottom: "24px",
            }}
          >
            <select
              className="input select search-input"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              aria-label="Filter by category"
            >
              <option value="">All categories</option>
              {(filterCategory && !categories.includes(filterCategory)
                ? [filterCategory, ...categories]
                : categories
              ).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="date"
              className="input search-input"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              aria-label="Filter by date"
            />
            <input
              type="search"
              className="input search-input"
              placeholder="Venue..."
              value={filterVenue}
              onChange={(e) => setFilterVenue(e.target.value)}
              aria-label="Filter by venue"
              maxLength={100}
            />
            {(hasActiveFilters || search || filterVenue) && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={clearFilters}
                style={{ justifySelf: "start" }}
              >
                <XCircleIcon size={14} /> Clear filters
              </button>
            )}
          </div>
        )}

        {/* Event List / My Registrations */}
        {tab === "registrations" ? (
          regLoading ? (
            <div className="loading-state">
              <span className="spinner" /> Loading your registrations...
            </div>
          ) : registrations.length === 0 ? (
            <div className="empty-state-card">
              <TicketIcon size={44} />
              <h3>No registrations found</h3>
              <p>You haven&apos;t registered or joined any waitlists yet.</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setTab("all")}
              >
                Browse Active Events
              </button>
            </div>
          ) : (
            <div className="event-cards-grid">
              {registrations.map((reg) => {
                const eventName = reg.event?.name || "Event";
                const isWaitlisted = reg.status === "waitlisted";
                const isConfirmed = reg.status === "confirmed";
                const isCancelled = reg.status === "cancelled";
                return (
                  <article
                    key={reg.id}
                    className={`event-item-card${isCancelled ? " event-card-cancelled" : ""}`}
                  >
                    <div className="card-top-row">
                      {reg.event?.category && (
                        <span className="category-pill">
                          <TagIcon size={12} /> {reg.event.category}
                        </span>
                      )}
                      <span
                        className={`status-pill ${
                          isConfirmed
                            ? "status-active"
                            : isWaitlisted
                            ? "status-warning"
                            : "status-cancelled"
                        }`}
                        style={{ textTransform: "capitalize" }}
                      >
                        {isConfirmed && <CheckIcon size={12} />}
                        {isWaitlisted && <ClockIcon size={12} />}
                        {isWaitlisted
                          ? `Waitlisted (Queue Pos #${reg.waitlistPosition ?? 1})`
                          : reg.status}
                      </span>
                    </div>

                    <h2 className="card-event-title">
                      <Link href={`/events/${reg.eventId}`}>{eventName}</Link>
                    </h2>

                    <div className="card-event-meta">
                      {reg.event?.date && (
                        <div className="meta-row">
                          <CalendarIcon size={15} />
                          <span>{new Date(reg.event.date).toLocaleDateString()}</span>
                        </div>
                      )}
                      {reg.event?.time && (
                        <div className="meta-row">
                          <ClockIcon size={15} />
                          <span>{reg.event.time}</span>
                        </div>
                      )}
                      {reg.event?.venue && (
                        <div className="meta-row">
                          <MapPinIcon size={15} />
                          <span>{reg.event.venue}</span>
                        </div>
                      )}
                      <div className="meta-row">
                        <ClockIcon size={15} />
                        <span>Registered on: {new Date(reg.timestamp || reg.createdAt).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="card-foot">
                      <Link href={`/events/${reg.eventId}`} className="btn btn-sm btn-ghost">
                        View Details
                      </Link>

                      <div className="card-actions">
                        {isConfirmed && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => {
                              setActionError(null);
                              setConfirmModal({
                                type: "cancel_registration",
                                eventId: reg.eventId,
                                eventName,
                                isWaitlist: false,
                              });
                            }}
                          >
                            <XCircleIcon size={14} /> Cancel Registration
                          </button>
                        )}
                        {isWaitlisted && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => {
                              setActionError(null);
                              setConfirmModal({
                                type: "cancel_registration",
                                eventId: reg.eventId,
                                eventName,
                                isWaitlist: true,
                              });
                            }}
                          >
                            <XCircleIcon size={14} /> Leave Waitlist
                          </button>
                        )}
                        {isCancelled && (
                          <span className="btn btn-sm" aria-disabled="true" style={{ opacity: 0.6 }}>
                            Cancelled
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )
        ) : loading ? (
          <div className="loading-state">
            <span className="spinner" /> Loading events...
          </div>
        ) : filteredEvents.length === 0 && hasActiveFilters ? (
          <div className="empty-state-card">
            <TicketIcon size={44} />
            <h3>No matching events</h3>
            <p>No events match your search or filters. Try different keywords or clear the filters.</p>
            <button type="button" className="btn btn-primary" onClick={clearFilters}>
              <XCircleIcon size={16} /> Clear filters
            </button>
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
                          <span>
                            <strong>{event.confirmedCount ?? (event.capacity - event.remainingSeats)}</strong> registered
                          </span>
                          {" · "}
                          {event.isFull ? (
                            <strong style={{ color: "var(--danger)" }}>0 available (Full)</strong>
                          ) : (
                            <strong>{event.remainingSeats} available</strong>
                          )}
                          {event.waitlistCount !== undefined && event.waitlistCount > 0 && (
                            <span style={{ color: "var(--text-muted)" }}> ({event.waitlistCount} waitlisted)</span>
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

                  {/* FR-007 & FR-009a: quick-register or join waitlist from card */}
                  {tab === "all" && event.status === "ACTIVE" && (
                    <div className="card-actions">
                      {registeredIds.has(event.id) ? (
                        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                          <span
                            className="btn btn-sm"
                            aria-live="polite"
                            style={{ background: "var(--success-soft)", color: "var(--success)" }}
                          >
                            <CheckIcon size={14} /> Registered
                          </span>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => {
                              setActionError(null);
                              setConfirmModal({
                                type: "cancel_registration",
                                eventId: event.id,
                                eventName: event.name,
                                isWaitlist: false,
                              });
                            }}
                            aria-label={`Cancel registration for ${event.name}`}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : waitlistedIds.has(event.id) ? (
                        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                          <span
                            className="btn btn-sm"
                            aria-live="polite"
                            style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
                          >
                            <ClockIcon size={14} /> Waitlisted
                          </span>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => {
                              setActionError(null);
                              setConfirmModal({
                                type: "cancel_registration",
                                eventId: event.id,
                                eventName: event.name,
                                isWaitlist: true,
                              });
                            }}
                            aria-label={`Leave waitlist for ${event.name}`}
                          >
                            Leave
                          </button>
                        </div>
                      ) : event.isFull ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-warning"
                          disabled={registeringId === event.id}
                          onClick={() => handleRegister(event, true)}
                          aria-label={`Join waitlist for event: ${event.name}`}
                          style={{ border: "1px solid var(--border)" }}
                        >
                          {registeringId === event.id ? (
                            <><span className="spinner" /> Joining...</>
                          ) : (
                            <><ClockIcon size={14} /> Join Waitlist</>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={registeringId === event.id}
                          onClick={() => handleRegister(event, false)}
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

                  {/* FR-005a & FR-010a: Organizer actions — View Registrants & Cancel/Delete */}
                  {role === "ORGANIZER" && tab === "organizer" && (
                    <div className="card-actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => openRegistrantsModal(event)}
                        aria-label={`View registrants for ${event.name}`}
                      >
                        <UsersIcon size={14} /> View Registrants
                      </button>
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
            <div
              className={`modal-icon ${
                confirmModal.type === "delete" || confirmModal.type === "cancel_registration"
                  ? "modal-icon-danger"
                  : "modal-icon-warning"
              }`}
            >
              {confirmModal.type === "delete" ? (
                <TrashIcon size={28} />
              ) : (
                <XCircleIcon size={28} />
              )}
            </div>

            <h2 id="confirm-modal-title" className="modal-title">
              {confirmModal.type === "cancel_registration"
                ? confirmModal.isWaitlist
                  ? "Leave Waitlist?"
                  : "Cancel Registration?"
                : confirmModal.type === "cancel"
                ? "Cancel this event?"
                : "Delete this event?"}
            </h2>

            <p className="modal-desc">
              {confirmModal.type === "cancel_registration" ? (
                confirmModal.isWaitlist ? (
                  <>
                    Are you sure you want to leave the waitlist for{" "}
                    <strong>&quot;{confirmModal.eventName}&quot;</strong>? You will lose your
                    current queue position.
                  </>
                ) : (
                  <>
                    Are you sure you want to cancel your registration for{" "}
                    <strong>&quot;{confirmModal.eventName}&quot;</strong>? Your reserved seat
                    will be released immediately and a cancellation confirmation email will be
                    sent to you.
                  </>
                )
              ) : confirmModal.type === "cancel" ? (
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
                className={`btn ${
                  confirmModal.type === "delete" || confirmModal.type === "cancel_registration"
                    ? "btn-danger"
                    : "btn-warning"
                } btn-md`}
                disabled={actionLoading}
                onClick={() =>
                  confirmModal.type === "cancel_registration"
                    ? handleSelfCancellation(
                        confirmModal.eventId,
                        confirmModal.eventName,
                        confirmModal.isWaitlist
                      )
                    : confirmModal.type === "cancel"
                    ? handleCancel(confirmModal.event)
                    : handleDelete(confirmModal.event)
                }
              >
                {actionLoading ? (
                  <><span className="spinner" /> Processing...</>
                ) : confirmModal.type === "cancel_registration" ? (
                  confirmModal.isWaitlist ? (
                    <><XCircleIcon size={16} /> Yes, Leave Waitlist</>
                  ) : (
                    <><XCircleIcon size={16} /> Yes, Cancel Registration</>
                  )
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
                {confirmModal.type === "cancel_registration"
                  ? confirmModal.isWaitlist
                    ? "Keep My Spot"
                    : "Keep Registration"
                  : "Keep Event"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── View Registrants Modal (FR-010a) ─────────────────────────────── */}
      {registrantsModalEvent && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="registrants-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRegistrantsModalEvent(null);
          }}
        >
          <div className="modal-card" style={{ maxWidth: "800px", width: "95%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
              <div>
                <span className="badge badge-primary">Attendee Roster</span>
                <h2 id="registrants-modal-title" className="modal-title" style={{ marginTop: "0.25rem", textAlign: "left" }}>
                  {registrantsModalEvent.name}
                </h2>
                <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                  Registered: <strong>{registrantsModalEvent.confirmedCount ?? (registrantsModalEvent.capacity - (registrantsModalEvent.remainingSeats ?? 0))}</strong>
                  {" · "}Available: <strong>{registrantsModalEvent.remainingSeats ?? 0}</strong>
                  {" · "}Capacity: <strong>{registrantsModalEvent.capacity}</strong>
                  {registrantsModalEvent.waitlistCount ? ` · Waitlisted: ${registrantsModalEvent.waitlistCount}` : ""}
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <a
                  href={`/api/events/${registrantsModalEvent.id}/export?format=csv`}
                  className="btn btn-sm btn-primary"
                  download
                >
                  Export CSV
                </a>
                <a
                  href={`/api/events/${registrantsModalEvent.id}/export?format=pdf`}
                  className="btn btn-sm btn-primary"
                  download
                >
                  Export PDF
                </a>
              </div>
            </div>

            {modalLoading ? (
              <div className="loading-state" style={{ padding: "2rem" }}>
                <span className="spinner" /> Loading registrants...
              </div>
            ) : modalRegistrants.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                <UsersIcon size={36} />
                <p style={{ marginTop: "0.5rem" }}>No participants registered for this event yet.</p>
              </div>
            ) : (
              <div style={{ maxHeight: "350px", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
                  <thead style={{ background: "var(--surface-2)", position: "sticky", top: 0 }}>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "0.5rem" }}>#</th>
                      <th style={{ padding: "0.5rem" }}>Name</th>
                      <th style={{ padding: "0.5rem" }}>Email</th>
                      <th style={{ padding: "0.5rem" }}>Status</th>
                      <th style={{ padding: "0.5rem" }}>Registered At</th>
                      <th style={{ padding: "0.5rem" }}>Waitlist Pos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalRegistrants.map((p, idx) => (
                      <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.5rem", color: "var(--text-muted)" }}>{idx + 1}</td>
                        <td style={{ padding: "0.5rem", fontWeight: 600 }}>{p.name}</td>
                        <td style={{ padding: "0.5rem", color: "var(--text-muted)" }}>{p.email}</td>
                        <td style={{ padding: "0.5rem" }}>
                          <span
                            className={`status-pill ${
                              p.status?.toLowerCase() === "confirmed"
                                ? "status-active"
                                : p.status?.toLowerCase() === "waitlisted"
                                ? "status-warning"
                                : "status-cancelled"
                            }`}
                            style={{ textTransform: "capitalize", fontSize: "0.75rem" }}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td style={{ padding: "0.5rem", color: "var(--text-muted)" }}>
                          {new Date(p.registeredAt).toLocaleDateString()}
                        </td>
                        <td style={{ padding: "0.5rem", color: "var(--text-muted)" }}>
                          {p.waitlistPosition ? `#${p.waitlistPosition}` : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: "1.25rem", justifyContent: "space-between" }}>
              <Link
                href={`/events/${registrantsModalEvent.id}/registrants`}
                className="btn btn-ghost btn-sm"
              >
                Open Full Management Page →
              </Link>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setRegistrantsModalEvent(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
