import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Brand } from "@/app/components/AuthShell";
import { CalendarIcon, SparkIcon, TicketIcon, UsersIcon } from "@/app/components/icons";
import { RegisterButton } from "./RegisterButton";
import { EventStatus, Role } from "@prisma/client";
import { getAuthUserFromRequest } from "@/lib/auth";
import { checkUserRegistration, getEventCapacity } from "@/lib/registration";

interface EventPageProps {
  params: { id: string };
}

export default async function EventPage({ params }: EventPageProps) {
  let event: any = null;

  try {
    event = await prisma.event.findUnique({
      where: { id: params.id },
    });
  } catch {
    // If DB is offline or not configured yet in this environment
  }

  // Fallback demo event for UI testing if ID doesn't exist in DB
  if (!event) {
    if (params.id === "demo" || params.id === "tech-fest") {
      event = {
        id: params.id,
        name: "Tech Fest 2026",
        description: "Join us for the premier tech symposium with workshops, hackathons, and keynote speakers.",
        date: new Date("2026-11-15T10:00:00Z"),
        time: "10:00 AM - 5:00 PM",
        venue: "Main Auditorium",
        category: "Tech",
        capacity: 100,
        status: EventStatus.ACTIVE,
        organizerId: "organizer-demo-id",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } else {
      notFound();
    }
  }

  const isCancelled =
    event.status === EventStatus.CANCELLED ||
    event.status === "CANCELLED" ||
    event.isCancelled === true;

  let capacityInfo: {
    capacity: number;
    confirmedCount: number;
    waitlistCount: number;
    remainingSeats: number;
    isFull: boolean;
  } | null = null;

  try {
    if (event?.id && event.id !== "demo" && event.id !== "tech-fest") {
      capacityInfo = await getEventCapacity(event.id);
    }
  } catch {
    // If DB is offline or table uninitialized
  }

  const capacity = typeof event.capacity === "number" ? event.capacity : 100;
  const confirmedCount = capacityInfo ? capacityInfo.confirmedCount : 0;
  const remainingSeats = capacityInfo ? capacityInfo.remainingSeats : Math.max(0, capacity - confirmedCount);
  const isFull = capacityInfo ? capacityInfo.isFull : remainingSeats <= 0;
  const waitlistCount = capacityInfo ? capacityInfo.waitlistCount : 0;

  let authUser: any = null;
  let initialRegistration: {
    id: string;
    status: string;
    timestamp: Date;
    waitlistPosition?: number;
  } | null = null;

  try {
    authUser = await getAuthUserFromRequest();
    if (authUser && event?.id && event.id !== "demo" && event.id !== "tech-fest") {
      const regCheck = await checkUserRegistration(authUser.id, event.id);
      if (regCheck.registered && regCheck.registration) {
        initialRegistration = {
          id: regCheck.registration.id,
          status: regCheck.registration.status,
          timestamp: regCheck.registration.timestamp,
          waitlistPosition: regCheck.waitlistPosition ?? undefined,
        };
      }
    }
  } catch {
    // If DB is offline or not configured yet in this environment
  }

  const isOwnerOrAdmin =
    authUser &&
    (authUser.id === event.organizerId ||
      authUser.role === Role.ADMIN ||
      authUser.role === "ADMIN");

  const eventName = event.name || event.title || "Untitled Event";

  const dateFormatted = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
  }).format(new Date(event.date));

  return (
    <div className="landing">
      <header className="nav">
        <Brand />
        <nav className="nav-links">
          <Link href="/" className="btn" style={{ background: "transparent" }}>
            Home
          </Link>
          <Link href="/events" className="btn" style={{ background: "transparent" }}>
            Browse Events
          </Link>
          <Link href="/events?tab=registrations" className="btn" style={{ background: "transparent" }}>
            My Registrations
          </Link>
        </nav>
      </header>

      <main id="main" className="hero" style={{ maxWidth: "760px", margin: "2rem auto", padding: "0 1.5rem" }}>
        <article
          className="card"
          style={{
            background: "var(--surface)",
            padding: "2rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
            <div>
              {event.category && (
                <span
                  className="badge"
                  style={{
                    background: "var(--primary-soft)",
                    color: "var(--primary)",
                    padding: "0.25rem 0.75rem",
                    borderRadius: "999px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  {event.category}
                </span>
              )}
              <h1 style={{ fontSize: "2rem", marginTop: "0.75rem", marginBottom: "0.5rem" }}>
                {eventName}
              </h1>
            </div>

            {isCancelled ? (
              <span
                className="badge badge-danger"
                style={{
                  background: "var(--danger-soft)",
                  color: "var(--danger)",
                  padding: "0.35rem 0.85rem",
                  borderRadius: "999px",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                }}
              >
                Cancelled
              </span>
            ) : isFull ? (
              <span
                className="badge badge-danger"
                style={{
                  background: "var(--danger-soft)",
                  color: "var(--danger)",
                  padding: "0.35rem 0.85rem",
                  borderRadius: "999px",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                }}
              >
                Event Full
              </span>
            ) : (
              <span
                className="badge badge-success"
                style={{
                  background: "var(--success-soft)",
                  color: "var(--success)",
                  padding: "0.35rem 0.85rem",
                  borderRadius: "999px",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                }}
              >
                Upcoming
              </span>
            )}
          </div>

          <p style={{ color: "var(--text-muted)", fontSize: "1.1rem", margin: "1rem 0 1.5rem 0" }}>
            {event.description || "No description provided."}
          </p>

          <div
            className="event-meta-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1rem",
              padding: "1rem",
              background: "var(--surface-2)",
              borderRadius: "var(--radius)",
              marginBottom: "1.5rem",
            }}
          >
            <div>
              <strong style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                <CalendarIcon size={16} /> Date & Time
              </strong>
              <div style={{ marginTop: "0.25rem", fontWeight: 600 }}>{dateFormatted}</div>
              {event.time && <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{event.time}</div>}
            </div>

            <div>
              <strong style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                <SparkIcon size={16} /> Venue
              </strong>
              <div style={{ marginTop: "0.25rem", fontWeight: 600 }}>{event.venue || "TBD"}</div>
            </div>

            <div>
              <strong style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                <TicketIcon size={16} /> Capacity & Seats
              </strong>
              <div style={{ marginTop: "0.25rem", fontWeight: 600 }}>
                {capacity} seats total · <span data-testid="available-seats">{remainingSeats} available</span>
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                <span data-testid="registered-count">{confirmedCount} registered</span>
                {waitlistCount > 0 ? ` · ${waitlistCount} waitlisted` : ""}
              </div>
            </div>
          </div>

          {isOwnerOrAdmin && (
            <div
              style={{
                background: "var(--surface-2)",
                padding: "1rem",
                borderRadius: "var(--radius)",
                marginBottom: "1.5rem",
                border: "1px dashed var(--border)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                <div>
                  <strong style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.95rem" }}>
                    <UsersIcon size={18} /> Organizer Participant Management
                  </strong>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                    {confirmedCount} active registrations · {remainingSeats} seats remaining
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {/* FR-004b: only the owning organizer may edit, and only while active */}
                  {authUser.id === event.organizerId && !isCancelled && (
                    <Link
                      href={`/events/${event.id}/edit`}
                      className="btn btn-sm btn-ghost"
                      style={{ border: "1px solid var(--border)" }}
                    >
                      Edit Event
                    </Link>
                  )}
                  <Link href={`/events/${event.id}/registrants`} className="btn btn-sm btn-primary">
                    <UsersIcon size={14} /> View Registrants
                  </Link>
                  <a
                    href={`/api/events/${event.id}/export?format=csv`}
                    className="btn btn-sm btn-ghost"
                    download
                    style={{ border: "1px solid var(--border)" }}
                  >
                    Export CSV
                  </a>
                  <a
                    href={`/api/events/${event.id}/export?format=pdf`}
                    className="btn btn-sm btn-ghost"
                    download
                    style={{ border: "1px solid var(--border)" }}
                  >
                    Export PDF
                  </a>
                </div>
              </div>
            </div>
          )}

          <RegisterButton
            eventId={event.id}
            isCancelled={isCancelled}
            isFull={isFull}
            remainingSeats={remainingSeats}
            waitlistCount={waitlistCount}
            initialRegistered={!!initialRegistration}
            initialRegistrationDetails={initialRegistration ?? undefined}
          />
        </article>
      </main>
    </div>
  );
}
