import Link from "next/link";
import { TicketIcon } from "./icons";

const SAMPLE_EVENTS = [
  { mon: "NOV", day: "14", title: "Hack Night: Build in 24h", meta: "Main Auditorium · 6:00 PM", tag: "Tech" },
  { mon: "NOV", day: "22", title: "Spring Cultural Fest", meta: "Open Grounds · 4:30 PM", tag: "Culture" },
  { mon: "DEC", day: "03", title: "Careers in AI — Panel", meta: "Seminar Hall B · 2:00 PM", tag: "Talk" },
];

export function Brand({ asLink = true }: { asLink?: boolean }) {
  const inner = (
    <>
      <span className="brand-mark">
        <TicketIcon size={18} />
      </span>
      <span>EventHub</span>
    </>
  );
  return asLink ? (
    <Link href="/" className="brand" aria-label="EventHub home">
      {inner}
    </Link>
  ) : (
    <span className="brand">{inner}</span>
  );
}

/**
 * Two-panel auth layout: a decorative brand panel (hidden below 960px)
 * and the form column. Used by signup and its follow-up screens.
 */
export function AuthShell({
  topRight,
  children,
}: {
  topRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="auth">
      <aside className="auth-aside" aria-hidden="true">
        <Brand asLink={false} />
        <div>
          <h2>Every event worth going to, in one place.</h2>
          <p>
            Discover what&apos;s happening, grab your spot in seconds, and get
            reminders before it starts.
          </p>
          <div className="ticket-stack">
            {SAMPLE_EVENTS.map((e) => (
              <div className="ticket" key={e.title}>
                <div className="ticket-date">
                  <small>{e.mon}</small>
                  <span>{e.day}</span>
                </div>
                <div className="ticket-body">
                  <strong>{e.title}</strong>
                  <small>{e.meta}</small>
                  <div>
                    <span className="ticket-tag">{e.tag}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="aside-stats">
          <div>
            <b>1-click</b>registration
          </div>
          <div>
            <b>Live</b>seat counts
          </div>
          <div>
            <b>Auto</b>reminders
          </div>
        </div>
      </aside>

      <div className="auth-main">
        <header className="auth-topbar">
          <Brand />
          <div>{topRight}</div>
        </header>
        <main id="main" className="auth-card">
          {children}
        </main>
      </div>
    </div>
  );
}
