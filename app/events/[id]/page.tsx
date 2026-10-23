import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Brand } from "@/app/components/AuthShell";
import { CalendarIcon, SparkIcon, TicketIcon } from "@/app/components/icons";
import { RegisterButton } from "./RegisterButton";

interface EventPageProps {
  params: { id: string };
}

export default async function EventPage({ params }: EventPageProps) {
  let event = null;

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
        title: "Tech Fest 2026",
        description: "Join us for the premier tech symposium with workshops, hackathons, and keynote speakers.",
        date: new Date("2026-11-15T10:00:00Z"),
        time: "10:00 AM - 5:00 PM",
        venue: "Main Auditorium",
        category: "Tech",
        capacity: 100,
        isCancelled: false,
        organizerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } else {
      notFound();
    }
  }

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
                {event.title}
              </h1>
            </div>

            {event.isCancelled ? (
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
                <TicketIcon size={16} /> Capacity
              </strong>
              <div style={{ marginTop: "0.25rem", fontWeight: 600 }}>{event.capacity} seats</div>
            </div>
          </div>

          <RegisterButton eventId={event.id} isCancelled={event.isCancelled} />
        </article>
      </main>
    </div>
  );
}
