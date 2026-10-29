import test from "node:test";
import assert from "node:assert/strict";
import { GET as eventRouteGet, PUT as eventRoutePut } from "../app/api/events/[id]/route";
import { prisma } from "../lib/prisma";
import { Prisma, RegistrationStatus, EventStatus, Role } from "@prisma/client";
import { createSessionValue } from "../lib/session";

process.env.SESSION_SECRET ||= "test-only-session-secret";

// FR-004b: organizer edits event details via PUT /api/events/[id].

function sessionCookieFor(userId: string) {
  return { Cookie: `session=${createSessionValue(userId)}` };
}

function createMockDb() {
  const users = new Map<string, any>();
  const events = new Map<string, any>();
  const registrations = new Map<string, any>();
  const categories = new Map<string, any>();

  users.set("u_org", { id: "u_org", name: "Campus Organizer", email: "organizer@test.com", role: Role.ORGANIZER, suspended: false });
  users.set("u_org2", { id: "u_org2", name: "Other Organizer", email: "other@test.com", role: Role.ORGANIZER, suspended: false });
  users.set("u_admin", { id: "u_admin", name: "Admin User", email: "admin@test.com", role: Role.ADMIN, suspended: false });
  users.set("u1", { id: "u1", name: "Amit Rao", email: "amit.rao@test.com", role: Role.PARTICIPANT, suspended: false });
  users.set("u2", { id: "u2", name: "Priya Nair", email: "priya.nair@test.com", role: Role.PARTICIPANT, suspended: false });

  const baseEvent = {
    description: "Annual technical symposium",
    date: new Date("2026-11-10T00:00:00Z"),
    time: "10:00 AM",
    venue: "Main Auditorium",
    category: "Technology",
    categoryId: "cat_tech",
    status: EventStatus.ACTIVE,
    organizerId: "u_org",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  };
  events.set("evt1", { ...baseEvent, id: "evt1", name: "Tech Fest", capacity: 100 });
  events.set("evt_cancelled", { ...baseEvent, id: "evt_cancelled", name: "Cancelled Fest", capacity: 50, status: EventStatus.CANCELLED });

  registrations.set("reg1", { id: "reg1", userId: "u1", eventId: "evt1", status: RegistrationStatus.CONFIRMED });
  registrations.set("reg2", { id: "reg2", userId: "u2", eventId: "evt1", status: RegistrationStatus.CONFIRMED });

  categories.set("Technology", { id: "cat_tech", name: "Technology" });

  return {
    users,
    events,
    registrations,
    categories,

    user: {
      async findUnique({ where }: any) {
        return users.get(where.id) || null;
      },
    },

    event: {
      async findUnique({ where, include }: any) {
        const e = events.get(where.id) || null;
        if (!e) return null;
        return { ...e, ...(include?.organizer ? { organizer: users.get(e.organizerId) } : {}) };
      },
      async update({ where, data, include }: any) {
        const e = events.get(where.id);
        if (!e) {
          throw new Prisma.PrismaClientKnownRequestError("Record to update not found", {
            code: "P2025",
            clientVersion: "5.22.0",
          });
        }
        const updated = { ...e, ...data, updatedAt: new Date() };
        events.set(where.id, updated);
        return { ...updated, ...(include?.organizer ? { organizer: users.get(updated.organizerId) } : {}) };
      },
      async create() {
        throw new Error("event.create must not be called when editing an event");
      },
    },

    registration: {
      async count({ where }: any = {}) {
        return Array.from(registrations.values()).filter((r) => {
          if (where?.eventId && r.eventId !== where.eventId) return false;
          if (where?.status && r.status !== where.status) return false;
          return true;
        }).length;
      },
    },

    category: {
      async upsert({ where, create }: any) {
        if (!categories.has(where.name)) {
          categories.set(where.name, { id: `cat_${where.name.toLowerCase()}`, ...create });
        }
        return categories.get(where.name);
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
  (prisma as any).category = mockDb.category;
});

const validBody = {
  name: "Tech Fest 2026 (Updated)",
  description: "Updated description with new keynote speakers",
  date: "2026-12-05",
  time: "11:30 AM",
  venue: "Seminar Hall 2",
  category: "Workshops",
  capacity: 150,
};

function putRequest(id: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000/api/events/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("FR-004b: PUT /api/events/[id] returns 401 when no auth provided", async () => {
  const res = await eventRoutePut(putRequest("evt1", validBody), { params: { id: "evt1" } });
  assert.equal(res.status, 401);
  assert.equal(mockDb.events.get("evt1").name, "Tech Fest");
});

test("FR-004b: PUT /api/events/[id] returns 403 for a participant", async () => {
  const res = await eventRoutePut(putRequest("evt1", validBody, sessionCookieFor("u1")), { params: { id: "evt1" } });
  assert.equal(res.status, 403);
  assert.equal(mockDb.events.get("evt1").name, "Tech Fest");
});

test("FR-004b: PUT /api/events/[id] returns 403 for an organizer who doesn't own the event", async () => {
  const res = await eventRoutePut(putRequest("evt1", validBody, sessionCookieFor("u_org2")), { params: { id: "evt1" } });
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.match(data.error, /not the organizer/);
  assert.equal(mockDb.events.get("evt1").name, "Tech Fest");
});

test("FR-004b: PUT /api/events/[id] returns 404 when event not found", async () => {
  const res = await eventRoutePut(putRequest("missing", validBody, sessionCookieFor("u_org")), { params: { id: "missing" } });
  assert.equal(res.status, 404);
});

test("FR-004b: PUT /api/events/[id] returns 400 on malformed JSON", async () => {
  const res = await eventRoutePut(putRequest("evt1", "{ bad json", sessionCookieFor("u_org")), { params: { id: "evt1" } });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, "Invalid request body");
});

test("FR-004b: PUT /api/events/[id] rejects an empty required field with 400 and field errors", async () => {
  const res = await eventRoutePut(
    putRequest("evt1", { ...validBody, venue: "  " }, sessionCookieFor("u_org")),
    { params: { id: "evt1" } }
  );
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.errors.venue, "Required field missing: venue");
  assert.equal(mockDb.events.get("evt1").venue, "Main Auditorium");
});

test("FR-004b: PUT /api/events/[id] rejects a non-positive capacity with 400", async () => {
  const res = await eventRoutePut(
    putRequest("evt1", { ...validBody, capacity: 0 }, sessionCookieFor("u_org")),
    { params: { id: "evt1" } }
  );
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.ok(data.errors.capacity);
});

test("FR-004b: PUT /api/events/[id] saves all edited fields to the existing event (no duplicate)", async () => {
  const res = await eventRoutePut(putRequest("evt1", validBody, sessionCookieFor("u_org")), { params: { id: "evt1" } });
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.event.id, "evt1");
  assert.equal(data.event.name, validBody.name);
  assert.equal(data.event.description, validBody.description);
  assert.equal(data.event.date, validBody.date);
  assert.equal(data.event.time, validBody.time);
  assert.equal(data.event.venue, validBody.venue);
  assert.equal(data.event.category, validBody.category);
  assert.equal(data.event.capacity, validBody.capacity);
  assert.equal(data.event.status, "ACTIVE");
  assert.equal(data.event.organizerId, "u_org");

  // Same row updated in place — no new event created
  assert.equal(mockDb.events.size, 2);
  const stored = mockDb.events.get("evt1");
  assert.equal(stored.name, validBody.name);
  assert.equal(stored.categoryId, "cat_workshops");
  assert.equal(stored.createdAt.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("FR-004b: PUT /api/events/[id] keeps existing registrations intact", async () => {
  const before = JSON.stringify(Array.from(mockDb.registrations.values()));
  const res = await eventRoutePut(putRequest("evt1", validBody, sessionCookieFor("u_org")), { params: { id: "evt1" } });
  assert.equal(res.status, 200);
  assert.equal(JSON.stringify(Array.from(mockDb.registrations.values())), before);
});

test("FR-004b: updated details are returned immediately by GET /api/events/[id]", async () => {
  const putRes = await eventRoutePut(putRequest("evt1", validBody, sessionCookieFor("u_org")), { params: { id: "evt1" } });
  assert.equal(putRes.status, 200);

  const getRes = await eventRouteGet(new Request("http://localhost:3000/api/events/evt1"), { params: { id: "evt1" } });
  assert.equal(getRes.status, 200);
  const data = await getRes.json();
  assert.equal(data.event.name, validBody.name);
  assert.equal(data.event.venue, validBody.venue);
  assert.equal(data.event.date, validBody.date);
  assert.equal(data.event.capacity, 150);
  assert.equal(data.event.confirmedCount, 2);
  assert.equal(data.event.remainingSeats, 148);
});

test("FR-004b: PUT /api/events/[id] rejects capacity below confirmed registrations with 409", async () => {
  const res = await eventRoutePut(
    putRequest("evt1", { ...validBody, capacity: 1 }, sessionCookieFor("u_org")),
    { params: { id: "evt1" } }
  );
  assert.equal(res.status, 409);
  const data = await res.json();
  assert.ok(data.errors.capacity);
  assert.equal(mockDb.events.get("evt1").capacity, 100);
  assert.equal(mockDb.events.get("evt1").name, "Tech Fest");
});

test("FR-004b: PUT /api/events/[id] allows capacity equal to confirmed registrations", async () => {
  const res = await eventRoutePut(
    putRequest("evt1", { ...validBody, capacity: 2 }, sessionCookieFor("u_org")),
    { params: { id: "evt1" } }
  );
  assert.equal(res.status, 200);
  assert.equal(mockDb.events.get("evt1").capacity, 2);
});

test("FR-004b: PUT /api/events/[id] returns 409 for a cancelled event", async () => {
  const res = await eventRoutePut(
    putRequest("evt_cancelled", validBody, sessionCookieFor("u_org")),
    { params: { id: "evt_cancelled" } }
  );
  assert.equal(res.status, 409);
  assert.equal(mockDb.events.get("evt_cancelled").name, "Cancelled Fest");
});
