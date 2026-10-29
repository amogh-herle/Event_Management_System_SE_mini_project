import test from "node:test";
import assert from "node:assert/strict";
import { GET as eventsRouteGet } from "../app/api/events/route";
import {
  parseEventFilters,
  buildEventFilterWhere,
  escapeLikePattern,
  matchesEventFilters,
  hasEventFilters,
  MAX_FILTER_LENGTH,
} from "../lib/eventFilters";
import { inMemoryEvents } from "../app/api/events/store";
import { prisma } from "../lib/prisma";
import { Prisma, RegistrationStatus, EventStatus, Role } from "@prisma/client";
import { createSessionValue } from "../lib/session";

process.env.SESSION_SECRET ||= "test-only-session-secret";

// FR-006b: search events by name; filter by category, date, or venue.

function sessionCookieFor(userId: string) {
  return { Cookie: `session=${createSessionValue(userId)}` };
}

// Minimal interpreter for the Prisma where-clauses GET /api/events builds,
// so these tests exercise the real route + filter-building code end to end.
// Like Postgres ILIKE, patterns arrive LIKE-escaped (\%, \_, \\); an
// unescaped % or _ would act as a wildcard, which this mock treats as a
// failure to escape and refuses to match.
function unescapeLike(pattern: string): string | null {
  if (/(^|[^\\])(\\\\)*[%_]/.test(pattern)) return null;
  return pattern.replace(/\\(.)/g, "$1");
}

function matchText(value: string | null | undefined, cond: any): boolean {
  if (cond === undefined) return true;
  const v = (value ?? "").toLowerCase();
  if (typeof cond === "string") return value === cond;
  if (cond.contains !== undefined) {
    const literal = unescapeLike(String(cond.contains));
    return literal !== null && v.includes(literal.toLowerCase());
  }
  if (cond.equals !== undefined) {
    const literal = unescapeLike(String(cond.equals));
    return literal !== null && v === literal.toLowerCase();
  }
  return true;
}

function matchWhere(e: any, where: any = {}): boolean {
  if (where.organizerId && e.organizerId !== where.organizerId) return false;
  if (where.status && e.status !== where.status) return false;
  if (!matchText(e.name, where.name)) return false;
  if (!matchText(e.category, where.category)) return false;
  if (!matchText(e.venue, where.venue)) return false;
  if (where.date) {
    const t = new Date(e.date).getTime();
    if (where.date.gte && t < where.date.gte.getTime()) return false;
    if (where.date.lt && t >= where.date.lt.getTime()) return false;
  }
  return true;
}

function createMockDb() {
  const users = new Map<string, any>();
  const events: any[] = [];
  const registrations: any[] = [];

  users.set("u_org", { id: "u_org", name: "Campus Organizer", email: "organizer@test.com", role: Role.ORGANIZER, suspended: false });
  users.set("u_org2", { id: "u_org2", name: "Other Organizer", email: "other@test.com", role: Role.ORGANIZER, suspended: false });
  users.set("u1", { id: "u1", name: "Amit Rao", email: "amit.rao@test.com", role: Role.PARTICIPANT, suspended: false });

  const ev = (id: string, fields: Record<string, any>, createdAt: string) => ({
    id,
    description: "An event",
    time: "10:00 AM",
    capacity: 50,
    status: EventStatus.ACTIVE,
    organizerId: "u_org",
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
    ...fields,
  });

  events.push(
    ev("e_techfest", { name: "Tech Fest 2026", category: "Technology", venue: "Main Auditorium", date: new Date("2026-11-10T00:00:00Z"), description: "Hackathon in the Seminar Hall annex" }, "2026-10-05"),
    ev("e_workshop", { name: "Full Stack Workshop", category: "Workshops", venue: "Seminar Hall 2", date: new Date("2026-11-15T00:00:00Z") }, "2026-10-04"),
    ev("e_cultural", { name: "Cultural Night", category: "Cultural", venue: "Open Air Theatre", date: new Date("2026-11-10T00:00:00Z") }, "2026-10-03"),
    ev("e_ai", { name: "AI Tech Talk", category: "Technology", venue: "Seminar Hall 1", date: new Date("2026-11-15T00:00:00Z"), organizerId: "u_org2" }, "2026-10-02"),
    ev("e_cancelled", { name: "Tech Meetup", category: "Technology", venue: "Main Auditorium", date: new Date("2026-11-10T00:00:00Z"), status: EventStatus.CANCELLED }, "2026-10-01"),
    ev("e_percent", { name: "100% Fun Run", category: "Sports", venue: "Ground", date: new Date("2026-12-01T00:00:00Z") }, "2026-09-30")
  );

  registrations.push(
    { id: "r1", userId: "u1", eventId: "e_techfest", status: RegistrationStatus.CONFIRMED },
    { id: "r2", userId: "u1", eventId: "e_workshop", status: RegistrationStatus.WAITLISTED }
  );

  return {
    users,
    events,
    registrations,
    lastFindManyArgs: null as any,

    user: {
      async findUnique({ where }: any) {
        return users.get(where.id) || null;
      },
    },
    event: {
      async findMany(this: any, args: any = {}) {
        mockDb.lastFindManyArgs = args;
        const list = events.filter((e) => matchWhere(e, args.where));
        if (args.orderBy?.createdAt === "desc") {
          list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        return list.map((e) => ({ ...e, organizer: users.get(e.organizerId) }));
      },
    },
    registration: {
      async groupBy({ where }: any) {
        const ids: string[] = where.eventId.in;
        const counts = new Map<string, number>();
        for (const r of registrations) {
          if (ids.includes(r.eventId) && r.status === where.status) {
            counts.set(r.eventId, (counts.get(r.eventId) ?? 0) + 1);
          }
        }
        return Array.from(counts, ([eventId, n]) => ({ eventId, _count: { _all: n } }));
      },
      async findMany({ where }: any) {
        return registrations.filter(
          (r) => r.userId === where.userId && where.eventId.in.includes(r.eventId) && where.status.in.includes(r.status)
        );
      },
    },
  };
}

let mockDb = createMockDb();

test.beforeEach(() => {
  mockDb = createMockDb();
  (prisma as any).user = mockDb.user;
  (prisma as any).event = mockDb.event;
  (prisma as any).registration = mockDb.registration;
});

async function list(query: string, headers: Record<string, string> = {}) {
  const res = await eventsRouteGet(new Request(`http://localhost:3000/api/events?${query}`, { headers }));
  assert.equal(res.status, 200);
  const data = await res.json();
  return data.events as any[];
}

const ids = (events: any[]) => events.map((e) => e.id);

// ── Search (name only) ───────────────────────────────────────────────────────

test("FR-006b: search by full event name", async () => {
  assert.deepEqual(ids(await list("active=true&q=Cultural%20Night")), ["e_cultural"]);
});

test("FR-006b: search matches partial names, case-insensitively", async () => {
  assert.deepEqual(ids(await list("active=true&q=tEcH")), ["e_techfest", "e_ai"]);
  assert.deepEqual(ids(await list("active=true&q=shop")), ["e_workshop"]);
});

test("FR-006b: search returns only name matches, not venue/category/description matches", async () => {
  // "Seminar" appears in venues and in Tech Fest's description, but in no event name
  assert.deepEqual(ids(await list("active=true&q=Seminar")), []);
  // "Workshops" is a category; only the event whose *name* contains it matches
  assert.deepEqual(ids(await list("active=true&q=Workshops")), []);
});

test("FR-006b: search ignores leading and trailing spaces", async () => {
  assert.deepEqual(ids(await list("active=true&q=%20%20Cultural%20%20")), ["e_cultural"]);
});

test("FR-006b: empty or whitespace-only search returns the default listing", async () => {
  const defaults = ids(await list("active=true"));
  assert.deepEqual(defaults, ["e_techfest", "e_workshop", "e_cultural", "e_ai", "e_percent"]);
  assert.deepEqual(ids(await list("active=true&q=")), defaults);
  assert.deepEqual(ids(await list("active=true&q=%20%20%20")), defaults);
});

test("FR-006b: a search with no matches returns an empty list", async () => {
  assert.deepEqual(await list("active=true&q=nonexistent-event-xyz"), []);
});

test("FR-006b: special characters are treated as plain text, not query syntax", async () => {
  // % and _ are LIKE wildcards in Postgres; they must match literally
  assert.deepEqual(ids(await list("active=true&q=%25")), ["e_percent"]);
  assert.deepEqual(ids(await list("active=true&q=_")), []);
  assert.deepEqual(ids(await list("active=true&category=%25")), []);
  assert.deepEqual(await list(`active=true&q=${encodeURIComponent("'; DROP TABLE \"Event\"; --")}`), []);
  // Prisma receives the raw text as a parameter value, never as SQL
  assert.deepEqual(mockDb.lastFindManyArgs.where.name, {
    contains: "'; DROP TABLE \"Event\"; --",
    mode: "insensitive",
  });
});

// ── Filters ──────────────────────────────────────────────────────────────────

test("FR-006b: filter by category (exact, case-insensitive)", async () => {
  assert.deepEqual(ids(await list("active=true&category=Technology")), ["e_techfest", "e_ai"]);
  assert.deepEqual(ids(await list("active=true&category=technology")), ["e_techfest", "e_ai"]);
  // No partial match on category — "Tech" is not a category
  assert.deepEqual(ids(await list("active=true&category=Tech")), []);
});

test("FR-006b: filter by date returns only events on that day", async () => {
  assert.deepEqual(ids(await list("active=true&date=2026-11-10")), ["e_techfest", "e_cultural"]);
  assert.deepEqual(ids(await list("active=true&date=2026-11-11")), []);
});

test("FR-006b: filter by venue (partial, case-insensitive)", async () => {
  assert.deepEqual(ids(await list("active=true&venue=seminar%20hall")), ["e_workshop", "e_ai"]);
  assert.deepEqual(ids(await list("active=true&venue=Auditorium")), ["e_techfest"]);
});

test("FR-006b: search and multiple filters combine (all must match)", async () => {
  assert.deepEqual(ids(await list("active=true&q=tech&category=Technology&date=2026-11-15")), ["e_ai"]);
  assert.deepEqual(ids(await list("active=true&category=Technology&venue=Auditorium")), ["e_techfest"]);
  assert.deepEqual(ids(await list("active=true&q=tech&venue=Open%20Air")), []);
});

test("FR-006b: filters keep excluding cancelled events from the active listing", async () => {
  // "Tech Meetup" matches name, category, date and venue but is CANCELLED
  const result = ids(await list("active=true&q=Meetup&category=Technology&date=2026-11-10&venue=Auditorium"));
  assert.deepEqual(result, []);
});

test("FR-006b: filters combine with the organizer's own events tab", async () => {
  const mine = ids(await list("organizer=me&category=Technology", sessionCookieFor("u_org")));
  // Includes the organizer's cancelled event (no active=true), excludes u_org2's event
  assert.deepEqual(mine, ["e_techfest", "e_cancelled"]);
});

test("FR-006b: clearing filters (no params) restores the full listing", async () => {
  assert.equal((await list("active=true&category=Cultural")).length, 1);
  assert.equal((await list("active=true")).length, 5);
});

test("FR-006b: invalid or empty filter values are ignored instead of erroring", async () => {
  const defaults = ids(await list("active=true"));
  assert.deepEqual(ids(await list("active=true&date=not-a-date")), defaults);
  assert.deepEqual(ids(await list("active=true&date=2026-02-30")), defaults);
  assert.deepEqual(ids(await list("active=true&date=10/11/2026")), defaults);
  assert.deepEqual(ids(await list("active=true&category=&venue=%20")), defaults);
});

test("FR-006b: filtered results keep the existing newest-first order and response fields", async () => {
  const events = await list("active=true&category=Technology", sessionCookieFor("u1"));
  assert.deepEqual(ids(events), ["e_techfest", "e_ai"]);
  const techfest = events[0];
  assert.equal(techfest.date, "2026-11-10");
  assert.equal(techfest.organizerName, "Campus Organizer");
  assert.equal(techfest.confirmedCount, 1);
  assert.equal(techfest.remainingSeats, 49);
  assert.equal(techfest.registered, true);
  assert.equal(mockDb.lastFindManyArgs.orderBy.createdAt, "desc");
});

test("FR-006b: search and filters also apply to the in-memory fallback when the DB is unavailable", async () => {
  (prisma as any).event = {
    async findMany() {
      throw new Prisma.PrismaClientInitializationError("Can't reach database server", "5.22.0");
    },
  };
  // Seeded fallback events: Tech Fest 2026 / Full Stack Workshop / Cultural Night
  assert.deepEqual(ids(await list("active=true&q=fest")), ["evt-seed-1"]);
  assert.deepEqual(ids(await list("active=true&category=cultural")), ["evt-seed-3"]);
  assert.deepEqual(ids(await list("active=true&date=2026-11-15")), ["evt-seed-2"]);
  assert.deepEqual(ids(await list("active=true&venue=seminar")), ["evt-seed-2"]);
  assert.equal((await list("active=true")).length, inMemoryEvents.filter((e) => e.status === "ACTIVE").length);
});

// ── Filter parsing & matching helpers ────────────────────────────────────────

test("FR-006b: parseEventFilters trims, caps length, and drops invalid values", () => {
  const long = "x".repeat(MAX_FILTER_LENGTH + 50);
  const f = parseEventFilters(
    new URLSearchParams({ q: "  Tech  ", category: " Music ", date: "2026-11-10", venue: long })
  );
  assert.deepEqual(f, { q: "Tech", category: "Music", date: "2026-11-10", venue: "x".repeat(MAX_FILTER_LENGTH) });
  assert.deepEqual(parseEventFilters(new URLSearchParams({ q: "   ", date: "2026-13-01" })), {});
  assert.equal(hasEventFilters({}), false);
  assert.equal(hasEventFilters({ venue: "Hall" }), true);
});

test("FR-006b: buildEventFilterWhere produces parameterized Prisma conditions", () => {
  assert.deepEqual(buildEventFilterWhere({}), {});
  assert.deepEqual(buildEventFilterWhere({ q: "tech", category: "Music", venue: "Hall", date: "2026-11-10" }), {
    name: { contains: "tech", mode: "insensitive" },
    category: { equals: "Music", mode: "insensitive" },
    venue: { contains: "Hall", mode: "insensitive" },
    date: { gte: new Date("2026-11-10T00:00:00.000Z"), lt: new Date("2026-11-11T00:00:00.000Z") },
  });
});

test("FR-006b: LIKE wildcards in search/filter input are escaped", () => {
  assert.equal(escapeLikePattern("100%"), "100\\%");
  assert.equal(escapeLikePattern("snake_case"), "snake\\_case");
  assert.equal(escapeLikePattern("a\\b"), "a\\\\b");
  assert.equal(escapeLikePattern("Tech Fest"), "Tech Fest");
  assert.deepEqual(buildEventFilterWhere({ q: "%", category: "Tech%", venue: "_" }), {
    name: { contains: "\\%", mode: "insensitive" },
    category: { equals: "Tech\\%", mode: "insensitive" },
    venue: { contains: "\\_", mode: "insensitive" },
  });
});

test("FR-006b: matchesEventFilters handles events with missing fields without throwing", () => {
  const partial = { name: "Untitled" } as any;
  assert.equal(matchesEventFilters(partial, {}), true);
  assert.equal(matchesEventFilters(partial, { q: "untit" }), true);
  assert.equal(matchesEventFilters(partial, { category: "Music" }), false);
  assert.equal(matchesEventFilters(partial, { venue: "Hall" }), false);
  assert.equal(matchesEventFilters(partial, { date: "2026-11-10" }), false);
  assert.equal(matchesEventFilters({ name: null, date: "garbage" } as any, { date: "2026-11-10" }), false);
  assert.equal(matchesEventFilters({ name: null } as any, { q: "x" }), false);
});
