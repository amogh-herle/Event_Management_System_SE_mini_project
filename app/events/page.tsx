"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Brand } from "../components/AuthShell";
import { RoleSwitcher } from "../components/RoleSwitcher";
import { useSessionRole } from "@/lib/useSessionRole";
import {
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  PlusIcon,
  TagIcon,
  UsersIcon,
  TicketIcon,
} from "../components/icons";
import { StoredEvent } from "../api/events/route";

export default function EventsDirectoryPage() {
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useSessionRole();
  const [tab, setTab] = useState<"organizer" | "all">("organizer");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    const url = tab === "organizer" ? "/api/events?organizer=me" : "/api/events";
    fetch(url, {
      headers: { "x-user-role": role },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.events && Array.isArray(data.events)) {
          setEvents(data.events);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
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
            <h1>{tab === "organizer" ? "My Organizer Events" : "All Campus Events"}</h1>
            <p className="lede">
              {tab === "organizer"
                ? "Manage and monitor your published events, seat capacities, and schedules."
                : "Browse all upcoming events across clubs, departments, and organizations."}
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
            <button
              type="button"
              role="tab"
              aria-selected={tab === "organizer"}
              onClick={() => setTab("organizer")}
              className={`tab-btn ${tab === "organizer" ? "active" : ""}`}
            >
              My Created Events
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "all"}
              onClick={() => setTab("all")}
              className={`tab-btn ${tab === "all" ? "active" : ""}`}
            >
              All Events
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
                : "No matching events found. Try adjusting your search query."}
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
              <article key={event.id} className="event-item-card">
                <div className="card-top-row">
                  <span className="category-pill">{event.category}</span>
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
                    <span>Capacity: <strong>{event.capacity} seats</strong></span>
                  </div>
                </div>

                <div className="card-foot">
                  <span className="organizer-tag">
                    Organizer: <strong>{event.organizerName}</strong>
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
