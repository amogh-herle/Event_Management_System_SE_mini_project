import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Brand } from "@/app/components/AuthShell";
import {
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  TagIcon,
  TicketIcon,
  UsersIcon,
  ArrowRightIcon,
} from "@/app/components/icons";
import { Role } from "@prisma/client";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getEventParticipantReport } from "@/lib/registration";

interface RegistrantsPageProps {
  params: { id: string };
}

export default async function EventRegistrantsPage({ params }: RegistrantsPageProps) {
  const authUser = await getAuthUserFromRequest();
  if (!authUser) {
    redirect("/login?next=" + encodeURIComponent(`/events/${params.id}/registrants`));
  }

  let event: any = null;
  try {
    event = await prisma.event.findUnique({
      where: { id: params.id },
      include: { organizer: { select: { id: true, name: true, email: true } } },
    });
  } catch {
    // If DB is offline
  }

  if (!event) {
    notFound();
  }

  const isOwner = authUser.id === event.organizerId;
  const isAdmin = authUser.role === Role.ADMIN || (authUser.role as string) === "ADMIN";

  if (!isOwner && !isAdmin) {
    return (
      <div className="landing">
        <header className="nav">
          <Brand />
        </header>
        <main className="hero" style={{ maxWidth: "600px", margin: "4rem auto", textAlign: "center" }}>
          <div className="card" style={{ padding: "2rem" }}>
            <h2>Access Denied</h2>
            <p style={{ color: "var(--text-muted)", margin: "1rem 0" }}>
              Only the organizer of this event or an administrator can view and export the participant list.
            </p>
            <Link href={`/events/${params.id}`} className="btn btn-primary">
              Back to Event
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const report = await getEventParticipantReport(params.id, prisma);
  if (!report) {
    notFound();
  }

  const { capacity, confirmedCount, availableSeats, waitlistCount, participants } = report;

  return (
    <div className="events-directory-page">
      <header className="nav event-nav">
        <Brand />
        <div className="event-nav-actions">
          <Link href={`/events/${params.id}`} className="btn btn-ghost">
            View Event Details
          </Link>
          <Link href="/events" className="btn btn-ghost">
            Events Directory
          </Link>
        </div>
      </header>

      <main className="events-directory-container" style={{ maxWidth: "1100px", margin: "2rem auto", padding: "0 1.5rem" }}>
        {/* Header Breadcrumb & Actions */}
        <div style={{ marginBottom: "1.5rem" }}>
          <nav style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
            <Link href="/events" style={{ color: "var(--primary)" }}>Events</Link>
            {" / "}
            <Link href={`/events/${params.id}`} style={{ color: "var(--primary)" }}>
              {event.name}
            </Link>
            {" / Registrants"}
          </nav>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <span className="badge badge-primary">Attendee Management</span>
              <h1 style={{ fontSize: "2rem", marginTop: "0.25rem", marginBottom: "0.25rem" }}>
                {event.name} — Registrants
              </h1>
              <p style={{ color: "var(--text-muted)", margin: 0 }}>
                Live participant roster, seat availability, and CSV/PDF export.
              </p>
            </div>

            {/* Export Actions */}
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              <a
                href={`/api/events/${event.id}/export?format=csv`}
                className="btn btn-primary"
                download
                id="export-csv-btn"
              >
                Export CSV
              </a>
              <a
                href={`/api/events/${event.id}/export?format=pdf`}
                className="btn btn-primary"
                download
                id="export-pdf-btn"
              >
                Export PDF
              </a>
            </div>
          </div>
        </div>

        {/* Live Metrics Grid (FR-010a / UT_01, UT_02) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          <div className="card" style={{ padding: "1.25rem", background: "var(--surface)" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
              Registered Participants
            </span>
            <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--primary)", marginTop: "0.25rem" }} data-testid="confirmed-count">
              {confirmedCount}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              Active confirmed tickets
            </div>
          </div>

          <div className="card" style={{ padding: "1.25rem", background: "var(--surface)" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
              Available Seats
            </span>
            <div
              style={{
                fontSize: "2rem",
                fontWeight: 700,
                color: availableSeats > 0 ? "var(--success)" : "var(--danger)",
                marginTop: "0.25rem",
              }}
              data-testid="available-seats-count"
            >
              {availableSeats}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              Capacity ({capacity}) minus registered ({confirmedCount})
            </div>
          </div>

          <div className="card" style={{ padding: "1.25rem", background: "var(--surface)" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
              Total Capacity
            </span>
            <div style={{ fontSize: "2rem", fontWeight: 700, marginTop: "0.25rem" }}>
              {capacity}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              Maximum attendee limit
            </div>
          </div>

          <div className="card" style={{ padding: "1.25rem", background: "var(--surface)" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
              Waitlist Queue
            </span>
            <div style={{ fontSize: "2rem", fontWeight: 700, color: waitlistCount > 0 ? "var(--warning)" : "var(--text-muted)", marginTop: "0.25rem" }}>
              {waitlistCount}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              Awaiting seat release
            </div>
          </div>
        </div>

        {/* Participant Table */}
        <div className="card" style={{ padding: "1.5rem", background: "var(--surface)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2 style={{ fontSize: "1.25rem", margin: 0 }}>
              Participant Roster ({participants.length})
            </h2>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Sorted by registration status and timestamp
            </div>
          </div>

          {participants.length === 0 ? (
            <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--text-muted)" }}>
              <UsersIcon size={40} />
              <p style={{ marginTop: "0.75rem", fontSize: "1rem" }}>No participants registered for this event yet.</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)", color: "var(--text-muted)" }}>
                    <th style={{ padding: "0.75rem 0.5rem", width: "40px" }}>#</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Participant Name</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Email Address</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Status</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Registration Date</th>
                    <th style={{ padding: "0.75rem 1rem" }}>Waitlist Pos</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map((p, idx) => {
                    const isConfirmed = p.status.toLowerCase() === "confirmed";
                    const isWaitlisted = p.status.toLowerCase() === "waitlisted";
                    const isCancelled = p.status.toLowerCase() === "cancelled";

                    return (
                      <tr
                        key={p.id}
                        style={{
                          borderBottom: "1px solid var(--border)",
                          background: idx % 2 === 1 ? "var(--surface-2)" : "transparent",
                        }}
                      >
                        <td style={{ padding: "0.75rem 0.5rem", color: "var(--text-muted)" }}>{idx + 1}</td>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>{p.name}</td>
                        <td style={{ padding: "0.75rem 1rem", color: "var(--text-muted)" }}>{p.email}</td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <span
                            className={`status-pill ${
                              isConfirmed
                                ? "status-active"
                                : isWaitlisted
                                ? "status-warning"
                                : "status-cancelled"
                            }`}
                            style={{ textTransform: "capitalize", fontSize: "0.75rem" }}
                          >
                            {isConfirmed && <CheckIcon size={12} />}
                            {isWaitlisted && <ClockIcon size={12} />}
                            {p.status}
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem 1rem", color: "var(--text-muted)" }}>
                          {new Date(p.registeredAt).toLocaleString()}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", color: "var(--text-muted)" }}>
                          {p.waitlistPosition ? `#${p.waitlistPosition}` : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
