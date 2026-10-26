import Link from "next/link";
import { Brand } from "./components/AuthShell";
import { LogoutButton } from "./components/LogoutButton";
import { getRealSessionUser } from "@/lib/auth";
import {
  ArrowRightIcon,
  CalendarIcon,
  PlusIcon,
  ShieldIcon,
  SparkIcon,
  TicketIcon,
} from "./components/icons";

const ROLES = [
  {
    icon: <TicketIcon size={22} />,
    title: "Participants",
    body: "Browse and filter events, register in one click, and get reminders.",
    href: "/events",
    action: "Browse Events",
  },
  {
    icon: <CalendarIcon size={22} />,
    title: "Organizers",
    body: "Create events, set capacity, and keep attendees updated automatically.",
    href: "/events/create",
    action: "Create Event (FR-004a)",
  },
  {
    icon: <ShieldIcon size={22} />,
    title: "Admins",
    body: "Approve organizers, moderate events, and export registration stats.",
    href: "/events",
    action: "View Platform",
  },
];

export default async function HomePage() {
  const sessionUser = await getRealSessionUser();

  return (
    <div className="landing">
      <header className="nav">
        <Brand />
        <nav className="nav-links" aria-label="Main Navigation" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <Link href="/events" className="btn btn-ghost">
            Browse Events
          </Link>
          <Link href="/events/create" className="btn btn-ghost">
            <PlusIcon size={16} /> Create Event
          </Link>
          {sessionUser ? (
            <>
              <span style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
                Signed in as <strong>{sessionUser.name}</strong>
              </span>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost">
                Log in
              </Link>
              <Link href="/signup" className="btn btn-primary">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </header>

      <main id="main" className="hero">
        <section>
          <span className="eyebrow">
            <SparkIcon size={14} /> Campus events, simplified
          </span>
          <h1>
            Find it. <em>Book it.</em> Show up.
          </h1>
          <p>
            One place to discover what&apos;s happening, register for events,
            and manage everything you&apos;re organizing.
          </p>
          <div className="hero-cta" style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <Link href="/events/create" className="btn btn-primary">
              <PlusIcon size={18} /> Create an Event <ArrowRightIcon size={18} />
            </Link>
            <Link href="/events" className="btn btn-ghost">
              Browse Directory
            </Link>
          </div>
        </section>

        <section className="role-grid" aria-label="Who it's for">
          {ROLES.map((r) => (
            <article className="role-card" key={r.title}>
              <span className="role-icon" aria-hidden="true">
                {r.icon}
              </span>
              <div>
                <h3>{r.title}</h3>
                <p>{r.body}</p>
                {r.href && (
                  <div style={{ marginTop: "10px" }}>
                    <Link href={r.href} style={{ fontSize: "13px", fontWeight: 700 }}>
                      {r.action} →
                    </Link>
                  </div>
                )}
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
