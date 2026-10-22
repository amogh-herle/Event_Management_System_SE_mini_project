import Link from "next/link";
import { Brand } from "./components/AuthShell";
import { ArrowRightIcon, CalendarIcon, ShieldIcon, SparkIcon, TicketIcon } from "./components/icons";

const ROLES = [
  {
    icon: <TicketIcon size={22} />,
    title: "Participants",
    body: "Browse and filter events, register in one click, and get reminders.",
  },
  {
    icon: <CalendarIcon size={22} />,
    title: "Organizers",
    body: "Create events, set capacity, and keep attendees updated automatically.",
  },
  {
    icon: <ShieldIcon size={22} />,
    title: "Admins",
    body: "Approve organizers, moderate events, and export registration stats.",
  },
];

export default function HomePage() {
  return (
    <div className="landing">
      <header className="nav">
        <Brand />
        <nav className="nav-links" aria-label="Account">
          <Link href="/signup" className="btn btn-primary">Sign up</Link>
        </nav>
      </header>

      <main id="main" className="hero">
        <section>
          <span className="eyebrow"><SparkIcon size={14} /> Campus events, simplified</span>
          <h1>
            Find it. <em>Book it.</em> Show up.
          </h1>
          <p>
            One place to discover what&apos;s happening, register for events,
            and manage everything you&apos;re organizing.
          </p>
          <div className="hero-cta">
            <Link href="/signup" className="btn btn-primary">
              Create a free account <ArrowRightIcon size={18} />
            </Link>
          </div>
        </section>

        <section className="role-grid" aria-label="Who it's for">
          {ROLES.map((r) => (
            <article className="role-card" key={r.title}>
              <span className="role-icon" aria-hidden="true">{r.icon}</span>
              <div>
                <h3>{r.title}</h3>
                <p>{r.body}</p>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
