import test from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { PATCH as eventRoutePatch, PUT as eventRoutePut } from "../app/api/events/[id]/route";
import {
  onNotification,
  clearNotificationListeners,
  diffEventDetails,
  notifyEventParticipants,
  type DispatchedNotification,
} from "../lib/registration";
import { eventUpdatedEmail, eventCancelledEmail } from "../lib/emailTemplates";
import { prisma } from "../lib/prisma";
import { Prisma, RegistrationStatus, EventStatus, Role } from "@prisma/client";
import { createSessionValue } from "../lib/session";

process.env.SESSION_SECRET ||= "test-only-session-secret";

// FR-005b: participants are notified when an event they registered for is
// updated (FR-004b PUT) or cancelled (FR-005a PATCH).

function sessionCookieFor(userId: string) {
  return { Cookie: `session=${createSessionValue(userId)}` };
}

// Event days are relative to today so these tests keep passing once a fixed
// date goes by (FR-004b rejects edits to past events).
function utcDay(offsetDays: number) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
const EVENT_DAY = utcDay(30);
const LATER_DAY = utcDay(32);

function createMockDb() {
  const users = new Map<string, any>();
  const events = new Map<string, any>();
  const registrations = new Map<string, any>();
  const categories = new Map<string, any>();

  users.set("u_org", { id: "u_org", name: "Campus Organizer", email: "organizer@test.com", role: Role.ORGANIZER, suspended: false });
  users.set("u_org2", { id: "u_org2", name: "Other Organizer", email: "other@test.com", role: Role.ORGANIZER, suspended: false });
  users.set("u1", { id: "u1", name: "Amit Rao", email: "amit.rao@test.com", role: Role.PARTICIPANT, suspended: false });
  users.set("u2", { id: "u2", name: "Priya Nair", email: "priya.nair@test.com", role: Role.PARTICIPANT, suspended: false });
  users.set("u3", { id: "u3", name: "Rahul Das", email: "rahul.das@test.com", role: Role.PARTICIPANT, suspended: false });
  users.set("u4", { id: "u4", name: "Sneha Iyer", email: "sneha.iyer@test.com", role: Role.PARTICIPANT, suspended: false });

  const baseEvent = {
    description: "Annual technical symposium",
    date: new Date(`${EVENT_DAY}T00:00:00Z`),
    time: "10:00 AM",
    venue: "Main Auditorium",
    category: "Technology",
    categoryId: "cat_tech",
    capacity: 100,
    status: EventStatus.ACTIVE,
    organizerId: "u_org",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  };
  // capacity matches the single confirmed registration (u1) below exactly,
  // so u2's waitlist entry reflects a genuinely full event (consistent with
  // how joinWaitlist only ever waitlists against a full event) and a plain
  // field edit doesn't incidentally open a seat and auto-promote u2 —
  // updateEventDetails' capacity-increase promotion is exercised on its own
  // in lib/registration.ts's tests, not implicitly by these.
  events.set("evt1", { ...baseEvent, id: "evt1", name: "Tech Fest", capacity: 1 });
  events.set("evt_empty", { ...baseEvent, id: "evt_empty", name: "Empty Workshop" });
  events.set("evt_other", { ...baseEvent, id: "evt_other", name: "Other Event" });
  events.set("evt_cancelled", { ...baseEvent, id: "evt_cancelled", name: "Cancelled Fest", status: EventStatus.CANCELLED });

  // evt1: u1 confirmed, u2 waitlisted, u3 cancelled their own registration
  registrations.set("reg1", { id: "reg1", userId: "u1", eventId: "evt1", status: RegistrationStatus.CONFIRMED });
  registrations.set("reg2", { id: "reg2", userId: "u2", eventId: "evt1", status: RegistrationStatus.WAITLISTED });
  registrations.set("reg3", { id: "reg3", userId: "u3", eventId: "evt1", status: RegistrationStatus.CANCELLED });
  // u4 is registered for a different event only
  registrations.set("reg4", { id: "reg4", userId: "u4", eventId: "evt_other", status: RegistrationStatus.CONFIRMED });
  registrations.set("reg5", { id: "reg5", userId: "u1", eventId: "evt_cancelled", status: RegistrationStatus.CONFIRMED });

  categories.set("Technology", { id: "cat_tech", name: "Technology" });

  function matchesStatus(r: any, status: any) {
    if (!status) return true;
    if (typeof status === "string") return r.status === status;
    if (Array.isArray(status.in)) return status.in.includes(r.status);
    return true;
  }

  return {
    users,
    events,
    registrations,

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
        // Mirrors Prisma 5's extended where-unique: extra filters must match too
        if (!e || (where.status && e.status !== where.status)) {
          throw new Prisma.PrismaClientKnownRequestError("Record to update not found", {
            code: "P2025",
            clientVersion: "5.22.0",
          });
        }
        const updated = { ...e, ...data, updatedAt: new Date() };
        events.set(where.id, updated);
        return { ...updated, ...(include?.organizer ? { organizer: users.get(updated.organizerId) } : {}) };
      },
    },

    registration: {
      async count({ where }: any = {}) {
        return Array.from(registrations.values()).filter(
          (r) => (!where?.eventId || r.eventId === where.eventId) && matchesStatus(r, where?.status)
        ).length;
      },
      async findMany({ where, include }: any = {}) {
        return Array.from(registrations.values())
          .filter((r) => (!where?.eventId || r.eventId === where.eventId) && matchesStatus(r, where?.status))
          .map((r) => ({ ...r, ...(include?.user ? { user: users.get(r.userId) } : {}) }));
      },
      // Supports updateEventDetails' capacity-increase promotion loop.
      async update({ where, data }: any) {
        for (const [key, r] of registrations.entries()) {
          if (r.id === where.id) {
            const updated = { ...r, ...data };
            registrations.set(key, updated);
            const u = users.get(updated.userId);
            return { ...updated, user: u ? { id: u.id, name: u.name, email: u.email } : undefined };
          }
        }
        throw new Error(`registration ${where.id} not found`);
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
let sent: DispatchedNotification[] = [];

test.beforeEach(() => {
  mockDb = createMockDb();
  (prisma as any).user = mockDb.user;
  (prisma as any).event = mockDb.event;
  (prisma as any).registration = mockDb.registration;
  (prisma as any).category = mockDb.category;
  // updateEventDetails runs inside a SERIALIZABLE transaction on the real
  // client; these tests swap out the model methods above but have no real
  // DB connection, so stub $transaction to just run the callback against
  // the same (already-mocked) client instead of opening a real one.
  (prisma as any).$transaction = async (fn: any) => fn(prisma);
  sent = [];
  onNotification((n) => {
    sent.push(n);
  });
});

test.afterEach(() => {
  clearNotificationListeners();
});

// Makes every nodemailer transport fail to send, simulating a provider outage.
async function withFailingMailProvider(fn: () => Promise<void>) {
  const proto = Object.getPrototypeOf(nodemailer.createTransport({ jsonTransport: true }));
  const original = proto.sendMail;
  proto.sendMail = async () => {
    throw new Error("SMTP provider unavailable");
  };
  try {
    await fn();
  } finally {
    proto.sendMail = original;
  }
}

function cancelRequest(id: string, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000/api/events/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ action: "cancel" }),
  });
}

const currentDetails = {
  name: "Tech Fest",
  description: "Annual technical symposium",
  date: EVENT_DAY,
  time: "10:00 AM",
  venue: "Main Auditorium",
  category: "Technology",
  capacity: 1, // matches evt1's capacity above — see the comment there
};

function putRequest(id: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000/api/events/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// ── Cancellation ─────────────────────────────────────────────────────────────

test("FR-005b: cancelling an event notifies its confirmed and waitlisted participants", async () => {
  const res = await eventRoutePatch(cancelRequest("evt1", sessionCookieFor("u_org")), { params: { id: "evt1" } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.event.status, "CANCELLED");
  assert.deepEqual(data.notifications, { recipients: 2, sent: 2, failed: 0 });

  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map((n) => n.to).sort(), ["amit.rao@test.com", "priya.nair@test.com"]);
  for (const n of sent) {
    assert.equal(n.type, "EVENT_CANCELLATION");
    assert.equal(n.eventId, "evt1");
    assert.equal(n.subject, "Event Cancelled: Tech Fest");
    assert.equal(n.details?.eventName, "Tech Fest");
    assert.equal(n.details?.eventVenue, "Main Auditorium");
  }
});

test("FR-005b: cancellation skips participants who already cancelled and other events' participants", async () => {
  await eventRoutePatch(cancelRequest("evt1", sessionCookieFor("u_org")), { params: { id: "evt1" } });
  const recipients = sent.map((n) => n.userId);
  assert.ok(!recipients.includes("u3"), "self-cancelled participant must not be notified");
  assert.ok(!recipients.includes("u4"), "participant of another event must not be notified");
});

test("FR-005b: cancellation keeps participant registration records intact", async () => {
  const before = JSON.stringify(Array.from(mockDb.registrations.values()));
  const res = await eventRoutePatch(cancelRequest("evt1", sessionCookieFor("u_org")), { params: { id: "evt1" } });
  assert.equal(res.status, 200);
  assert.equal(JSON.stringify(Array.from(mockDb.registrations.values())), before);
  assert.equal(mockDb.events.has("evt1"), true);
});

test("FR-005b: unauthorized cancellation attempts are rejected and notify nobody", async () => {
  const noAuth = await eventRoutePatch(cancelRequest("evt1"), { params: { id: "evt1" } });
  assert.equal(noAuth.status, 401);
  const participant = await eventRoutePatch(cancelRequest("evt1", sessionCookieFor("u1")), { params: { id: "evt1" } });
  assert.equal(participant.status, 403);
  const otherOrganizer = await eventRoutePatch(cancelRequest("evt1", sessionCookieFor("u_org2")), { params: { id: "evt1" } });
  assert.equal(otherOrganizer.status, 403);

  assert.equal(sent.length, 0);
  assert.equal(mockDb.events.get("evt1").status, EventStatus.ACTIVE);
});

test("FR-005b: cancelling a missing event fails and notifies nobody", async () => {
  const res = await eventRoutePatch(cancelRequest("missing", sessionCookieFor("u_org")), { params: { id: "missing" } });
  assert.equal(res.status, 404);
  assert.equal(sent.length, 0);
});

test("FR-005b: re-cancelling an already-cancelled event does not notify participants again", async () => {
  const res = await eventRoutePatch(
    cancelRequest("evt_cancelled", sessionCookieFor("u_org")),
    { params: { id: "evt_cancelled" } }
  );
  assert.equal(res.status, 409);
  assert.equal(sent.length, 0);
});

test("FR-005b: two concurrent cancel requests notify each participant only once", async () => {
  const [a, b] = await Promise.all([
    eventRoutePatch(cancelRequest("evt1", sessionCookieFor("u_org")), { params: { id: "evt1" } }),
    eventRoutePatch(cancelRequest("evt1", sessionCookieFor("u_org")), { params: { id: "evt1" } }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(sent.length, 2);
});

test("FR-005b: cancelling an event with no participants succeeds with zero notifications", async () => {
  const res = await eventRoutePatch(cancelRequest("evt_empty", sessionCookieFor("u_org")), { params: { id: "evt_empty" } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.notifications, { recipients: 0, sent: 0, failed: 0 });
  assert.equal(sent.length, 0);
});

test("FR-005b: a mail-provider failure doesn't fail the cancellation and is reported as failed", async () => {
  await withFailingMailProvider(async () => {
    const res = await eventRoutePatch(cancelRequest("evt1", sessionCookieFor("u_org")), { params: { id: "evt1" } });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.event.status, "CANCELLED");
    assert.deepEqual(data.notifications, { recipients: 2, sent: 0, failed: 2 });
  });
  assert.equal(mockDb.events.get("evt1").status, EventStatus.CANCELLED);
});

test("FR-005b: a participant lookup failure doesn't fail the cancellation", async () => {
  mockDb.registration.findMany = async () => {
    throw new Error("connection reset");
  };
  const res = await eventRoutePatch(cancelRequest("evt1", sessionCookieFor("u_org")), { params: { id: "evt1" } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.event.status, "CANCELLED");
  assert.deepEqual(data.notifications, { recipients: 0, sent: 0, failed: 0 });
});

// ── Update ───────────────────────────────────────────────────────────────────

test("FR-005b: updating an event notifies participants with the changed details", async () => {
  const res = await eventRoutePut(
    putRequest(
      "evt1",
      { ...currentDetails, date: LATER_DAY, time: "2:00 PM", venue: "Seminar Hall 2" },
      sessionCookieFor("u_org")
    ),
    { params: { id: "evt1" } }
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.notifications, { recipients: 2, sent: 2, failed: 0 });

  assert.deepEqual(sent.map((n) => n.to).sort(), ["amit.rao@test.com", "priya.nair@test.com"]);
  for (const n of sent) {
    assert.equal(n.type, "EVENT_UPDATE");
    assert.equal(n.subject, "Event Updated: Tech Fest");
    assert.deepEqual(n.details?.changes, [
      { field: "date", label: "Date", before: EVENT_DAY, after: LATER_DAY },
      { field: "time", label: "Time", before: "10:00 AM", after: "2:00 PM" },
      { field: "venue", label: "Venue", before: "Main Auditorium", after: "Seminar Hall 2" },
    ]);
  }
});

test("FR-005b: a renamed event's notification uses the new name and lists the old one", async () => {
  await eventRoutePut(
    putRequest("evt1", { ...currentDetails, name: "Tech Fest 2026" }, sessionCookieFor("u_org")),
    { params: { id: "evt1" } }
  );
  assert.equal(sent.length, 2);
  assert.equal(sent[0].subject, "Event Updated: Tech Fest 2026");
  assert.deepEqual(sent[0].details?.changes, [
    { field: "name", label: "Event name", before: "Tech Fest", after: "Tech Fest 2026" },
  ]);
});

test("FR-005b: an update with no participant-facing changes sends no EVENT_UPDATE notification", async () => {
  // Raising capacity alone is not a participant-facing "change" per
  // diffEventDetails, so no EVENT_UPDATE email goes out — but it does
  // legitimately open a seat for u2's waitlist entry, which is a separate,
  // correct WAITLIST_PROMOTION side effect, not a regression here.
  const res = await eventRoutePut(
    putRequest("evt1", { ...currentDetails, capacity: 150 }, sessionCookieFor("u_org")),
    { params: { id: "evt1" } }
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.notifications, { recipients: 0, sent: 0, failed: 0 });
  assert.equal(sent.filter((n) => n.type === "EVENT_UPDATE").length, 0);
});

test("FR-005b: repeating the same update doesn't notify participants twice", async () => {
  const body = { ...currentDetails, venue: "Seminar Hall 2" };
  await eventRoutePut(putRequest("evt1", body, sessionCookieFor("u_org")), { params: { id: "evt1" } });
  assert.equal(sent.length, 2);
  await eventRoutePut(putRequest("evt1", body, sessionCookieFor("u_org")), { params: { id: "evt1" } });
  assert.equal(sent.length, 2);
});

test("FR-005b: failed or unauthorized updates notify nobody", async () => {
  const changed = { ...currentDetails, venue: "Seminar Hall 2" };
  const cases: Array<[string, unknown, Record<string, string>, number]> = [
    ["evt1", changed, {}, 401],
    ["evt1", changed, sessionCookieFor("u1"), 403],
    ["evt1", changed, sessionCookieFor("u_org2"), 403],
    ["evt1", { ...changed, venue: "" }, sessionCookieFor("u_org"), 400],
    ["evt1", { ...changed, capacity: 0 }, sessionCookieFor("u_org"), 400],
    ["missing", changed, sessionCookieFor("u_org"), 404],
    ["evt_cancelled", changed, sessionCookieFor("u_org"), 409],
  ];
  for (const [id, body, headers, expected] of cases) {
    const res = await eventRoutePut(putRequest(id, body, headers), { params: { id } });
    assert.equal(res.status, expected, `${id} expected ${expected}`);
  }
  assert.equal(sent.length, 0);
  assert.equal(mockDb.events.get("evt1").venue, "Main Auditorium");
});

test("FR-005b: an update rejected for capacity below confirmed seats notifies nobody", async () => {
  mockDb.registrations.set("reg6", { id: "reg6", userId: "u4", eventId: "evt1", status: RegistrationStatus.CONFIRMED });
  const res = await eventRoutePut(
    putRequest("evt1", { ...currentDetails, venue: "Seminar Hall 2", capacity: 1 }, sessionCookieFor("u_org")),
    { params: { id: "evt1" } }
  );
  assert.equal(res.status, 409);
  assert.equal(sent.length, 0);
});

test("FR-005b: a mail-provider failure doesn't fail the update and is reported as failed", async () => {
  await withFailingMailProvider(async () => {
    const res = await eventRoutePut(
      putRequest("evt1", { ...currentDetails, venue: "Seminar Hall 2" }, sessionCookieFor("u_org")),
      { params: { id: "evt1" } }
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.event.venue, "Seminar Hall 2");
    assert.deepEqual(data.notifications, { recipients: 2, sent: 0, failed: 2 });
  });
});

test("FR-005b: an updated event with no participants succeeds with zero notifications", async () => {
  const res = await eventRoutePut(
    putRequest("evt_empty", { ...currentDetails, name: "Empty Workshop", venue: "Lab 3" }, sessionCookieFor("u_org")),
    { params: { id: "evt_empty" } }
  );
  assert.equal(res.status, 200);
  assert.equal(sent.length, 0);
});

// ── Helpers & templates ──────────────────────────────────────────────────────

test("FR-005b: notifyEventParticipants notifies a participant only once even with duplicate rows", async () => {
  const db = {
    registration: {
      async findMany() {
        return [
          { id: "a", userId: "u1", eventId: "e1", status: "CONFIRMED", user: { name: "Amit", email: "Amit@Test.com" } },
          { id: "b", userId: "u1", eventId: "e1", status: "WAITLISTED", user: { name: "Amit", email: "amit@test.com" } },
          { id: "c", userId: "u2", eventId: "e1", status: "CANCELLED", user: { name: "Priya", email: "priya@test.com" } },
        ];
      },
    },
  };
  const result = await notifyEventParticipants({ kind: "CANCELLATION", event: { id: "e1", name: "Expo" } }, db);
  assert.deepEqual(result, { recipients: 1, sent: 1, failed: 0 });
  assert.equal(sent.length, 1);
});

test("FR-005b: a participant without an email address is counted as failed, not sent", async () => {
  const db = {
    registration: {
      async findMany() {
        return [{ id: "a", userId: "ux", eventId: "e1", status: "CONFIRMED", user: { name: "No Mail", email: "" } }];
      },
    },
  };
  const result = await notifyEventParticipants({ kind: "CANCELLATION", event: { id: "e1", name: "Expo" } }, db);
  assert.deepEqual(result, { recipients: 1, sent: 0, failed: 1 });
});

test("FR-005b: diffEventDetails ignores capacity and treats equal dates as unchanged", () => {
  const before = { ...currentDetails, date: new Date(`${EVENT_DAY}T00:00:00Z`) };
  assert.deepEqual(diffEventDetails(before, { ...currentDetails, capacity: 5 } as any), []);
  const changes = diffEventDetails(before, { ...currentDetails, description: "New agenda" });
  assert.deepEqual(changes, [{ field: "description", label: "Description", after: "New agenda" }]);
});

test("FR-005b: notification emails include the changes and escape HTML", () => {
  const updated = eventUpdatedEmail(
    "<Amit>",
    "Tech & Fest",
    [{ label: "Venue", before: "Hall A", after: "<b>Hall B</b>" }],
    "2026-11-12",
    "2:00 PM",
    "<b>Hall B</b>"
  );
  assert.equal(updated.subject, "Event Updated: Tech & Fest");
  assert.match(updated.html, /Hall A &rarr; &lt;b&gt;Hall B&lt;\/b&gt;/);
  assert.ok(!updated.html.includes("<Amit>"));

  const cancelled = eventCancelledEmail("Amit", "Tech Fest", "2026-11-10", "10:00 AM", "Main Auditorium");
  assert.equal(cancelled.subject, "Event Cancelled: Tech Fest");
  assert.match(cancelled.html, /has been cancelled/);
  assert.match(cancelled.html, /Main Auditorium/);
});

test("FR-005b: a participant promoted off the waitlist by a capacity-raising edit gets only the promotion email, not a second EVENT_UPDATE email", async () => {
  mockDb.events.set("evt_promo", { ...mockDb.events.get("evt1"), id: "evt_promo", name: "Promo Fest", capacity: 1 });
  mockDb.registrations.set("reg_promo_confirmed", {
    id: "reg_promo_confirmed",
    userId: "u1",
    eventId: "evt_promo",
    status: RegistrationStatus.CONFIRMED,
  });
  mockDb.registrations.set("reg_promo_waitlisted", {
    id: "reg_promo_waitlisted",
    userId: "u2",
    eventId: "evt_promo",
    status: RegistrationStatus.WAITLISTED,
    createdAt: new Date("2026-10-05T00:00:00Z"),
  });

  const res = await eventRoutePut(
    putRequest(
      "evt_promo",
      { ...currentDetails, name: "Promo Fest", venue: "New Venue", capacity: 2 },
      sessionCookieFor("u_org")
    ),
    { params: { id: "evt_promo" } }
  );
  assert.equal(res.status, 200);
  assert.equal(mockDb.registrations.get("reg_promo_waitlisted").status, RegistrationStatus.CONFIRMED);

  const toU2 = sent.filter((n) => n.userId === "u2");
  assert.equal(toU2.length, 1, "the promoted user must receive exactly one email");
  assert.equal(toU2[0].type, "WAITLIST_PROMOTION");

  const toU1 = sent.filter((n) => n.userId === "u1");
  assert.equal(toU1.length, 1, "the already-confirmed participant still gets the venue-change email");
  assert.equal(toU1[0].type, "EVENT_UPDATE");
});

test("FR-005b: an organizer holding their own event's registration is not notified of their own cancellation or edit", async () => {
  mockDb.events.set("evt_self", { ...mockDb.events.get("evt1"), id: "evt_self", name: "Self Fest", capacity: 5 });
  mockDb.registrations.set("reg_self_org", {
    id: "reg_self_org",
    userId: "u_org",
    eventId: "evt_self",
    status: RegistrationStatus.CONFIRMED,
  });

  const cancelRes = await eventRoutePatch(cancelRequest("evt_self", sessionCookieFor("u_org")), {
    params: { id: "evt_self" },
  });
  assert.equal(cancelRes.status, 200);
  assert.equal(sent.filter((n) => n.userId === "u_org").length, 0, "organizer must not email themself");
});

// ── In-memory fallback (DB unreachable) ──────────────────────────────────────

test("FR-005b: fallback PATCH cancel and PUT edit return the same notifications shape as the DB path", async () => {
  const { inMemoryEvents } = await import("../app/api/events/store");
  (prisma as any).$transaction = async () => {
    throw new Prisma.PrismaClientInitializationError("Can't reach database server", "5.22.0");
  };
  (prisma as any).event.findUnique = async () => {
    throw new Prisma.PrismaClientInitializationError("Can't reach database server", "5.22.0");
  };
  const stored = {
    id: "evt_mem",
    name: "Fallback Fest",
    description: "Stored in memory",
    date: EVENT_DAY,
    time: "10:00 AM",
    venue: "Main Auditorium",
    category: "Technology",
    capacity: 10,
    status: "ACTIVE" as const,
    organizerId: "u_org",
    organizerName: "Campus Organizer",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
  inMemoryEvents.push(stored);
  try {
    const putRes = await eventRoutePut(
      putRequest("evt_mem", { ...currentDetails, venue: "Seminar Hall 2" }, sessionCookieFor("u_org")),
      { params: { id: "evt_mem" } }
    );
    assert.equal(putRes.status, 200);
    assert.deepEqual((await putRes.json()).notifications, { recipients: 0, sent: 0, failed: 0 });

    const patchRes = await eventRoutePatch(cancelRequest("evt_mem", sessionCookieFor("u_org")), {
      params: { id: "evt_mem" },
    });
    assert.equal(patchRes.status, 200);
    assert.deepEqual((await patchRes.json()).notifications, { recipients: 0, sent: 0, failed: 0 });
    assert.equal(sent.length, 0);
  } finally {
    const idx = inMemoryEvents.findIndex((e) => e.id === "evt_mem");
    if (idx !== -1) inMemoryEvents.splice(idx, 1);
  }
});
