import test from "node:test";
import assert from "node:assert/strict";
import { Prisma, RegistrationStatus, EventStatus } from "@prisma/client";
import {
  registerForEvent,
  joinWaitlist,
  cancelRegistration,
  getWaitlistPosition,
  getWaitlistCount,
  checkUserRegistration,
  getEventCapacity,
  listRegistrations,
  getEventParticipantReport,
  exportParticipantsToCSV,
  exportParticipantsToPDF,
  clearEventLocks,
  onNotification,
  onWaitlistNotification,
  clearNotificationListeners,
  sendEventReminders,
  DUPLICATE_REGISTRATION_ERROR,
  EVENT_CANCELLED_ERROR,
  EVENT_NOT_FOUND_ERROR,
  USER_NOT_FOUND_ERROR,
  USER_SUSPENDED_ERROR,
  AUTH_REQUIRED_ERROR,
  EVENT_FULL_ERROR,
  ALREADY_WAITLISTED_ERROR,
  EVENT_NOT_FULL_ERROR,
  REGISTRATION_NOT_FOUND_ERROR,
  CANNOT_CANCEL_CANCELLED_EVENT_ERROR,
} from "../lib/registration";
import {
  registrationConfirmationEmail,
  registrationCancellationEmail,
  eventReminderEmail,
} from "../lib/emailTemplates";

/**
 * Mock database creating in-memory storage that simulates PostgreSQL & Prisma
 * behavior, including foreign keys and unique constraints (code P2002).
 */
function createMockDb() {
  const users = new Map<string, any>();
  const events = new Map<string, any>();
  const registrations = new Map<string, any>(); // key: `${userId}_${eventId}`

  let regIdCounter = 1;

  return {
    users,
    events,
    registrations,

    user: {
      async findUnique({ where }: any) {
        if (where.id) return users.get(where.id) || null;
        if (where.email) {
          for (const u of users.values()) {
            if (u.email.toLowerCase() === where.email.toLowerCase()) return u;
          }
        }
        return null;
      },
    },

    event: {
      async findUnique({ where }: any) {
        return events.get(where.id) || null;
      },
      async findMany({ where }: any = {}) {
        return Array.from(events.values()).filter((e) => {
          if (where?.status && e.status !== where.status) return false;
          if (where?.date?.gte && new Date(e.date).getTime() < new Date(where.date.gte).getTime()) return false;
          if (where?.date?.lte && new Date(e.date).getTime() > new Date(where.date.lte).getTime()) return false;
          return true;
        });
      },
    },

    registration: {
      async findUnique({ where }: any) {
        if (where.userId_eventId) {
          const key = `${where.userId_eventId.userId}_${where.userId_eventId.eventId}`;
          return registrations.get(key) || null;
        }
        if (where.id) {
          for (const r of registrations.values()) {
            if (r.id === where.id) return r;
          }
        }
        return null;
      },

      async findMany({ where, include, orderBy }: any = {}) {
        let list = Array.from(registrations.values());
        if (where?.eventId) list = list.filter((r) => r.eventId === where.eventId);
        if (where?.userId) list = list.filter((r) => r.userId === where.userId);
        if (where?.status) list = list.filter((r) => r.status === where.status);
        if (orderBy?.createdAt === "desc") {
          list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }
        return list.map((r) => {
          const user = users.get(r.userId);
          const event = events.get(r.eventId);
          return {
            ...r,
            ...(include?.user ? { user: { id: user?.id, name: user?.name, email: user?.email } } : {}),
            ...(include?.event
              ? {
                  event: {
                    id: event?.id,
                    name: event?.name || event?.title,
                    date: event?.date,
                    status:
                      event?.status ||
                      (event?.isCancelled ? EventStatus.CANCELLED : EventStatus.ACTIVE),
                    time: event?.time,
                    venue: event?.venue,
                    category: event?.category,
                    capacity: event?.capacity,
                  },
                }
              : {}),
          };
        });
      },

      async findFirst({ where, orderBy, include }: any = {}) {
        let list = Array.from(registrations.values());
        if (where?.eventId) list = list.filter((r) => r.eventId === where.eventId);
        if (where?.userId) list = list.filter((r) => r.userId === where.userId);
        if (where?.status) list = list.filter((r) => r.status === where.status);
        list.sort((a, b) => {
          const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          if (diff !== 0) return diff;
          return String(a.id).localeCompare(String(b.id));
        });
        const match = list[0];
        if (!match) return null;
        const user = users.get(match.userId);
        const event = events.get(match.eventId);
        return {
          ...match,
          ...(include?.user ? { user: { id: user.id, name: user.name, email: user.email } } : {}),
          ...(include?.event ? { event: { id: event.id, name: event.name || event.title, date: event.date, status: event.status || (event.isCancelled ? EventStatus.CANCELLED : EventStatus.ACTIVE), capacity: event.capacity } } : {}),
        };
      },

      async count({ where }: any = {}) {
        const list = Array.from(registrations.values());
        return list.filter((r) => {
          if (where?.userId && r.userId !== where.userId) return false;
          if (where?.eventId && r.eventId !== where.eventId) return false;
          if (where?.status && r.status !== where.status) return false;
          if (where?.createdAt?.lte && new Date(r.createdAt).getTime() > new Date(where.createdAt.lte).getTime()) return false;
          return true;
        }).length;
      },

      async create({ data, include }: any) {
        const key = `${data.userId}_${data.eventId}`;
        if (registrations.has(key)) {
          // Throws exact Prisma unique constraint violation code
          throw new Prisma.PrismaClientKnownRequestError(
            `Unique constraint failed on the fields: (userId, eventId)`,
            {
              code: "P2002",
              clientVersion: "5.22.0",
            }
          );
        }

        const user = users.get(data.userId);
        const event = events.get(data.eventId);

        const record = {
          id: `reg_cuid_${String(regIdCounter++).padStart(6, "0")}`,
          userId: data.userId,
          eventId: data.eventId,
          status: data.status || RegistrationStatus.CONFIRMED,
          createdAt: data.createdAt || new Date(),
          updatedAt: new Date(),
          ...(include?.user ? { user: { id: user.id, name: user.name, email: user.email } } : {}),
          ...(include?.event ? { event: { id: event.id, name: event.name || event.title, date: event.date, status: event.status || (event.isCancelled ? EventStatus.CANCELLED : EventStatus.ACTIVE), capacity: event.capacity } } : {}),
        };

        registrations.set(key, record);
        return record;
      },

      async update({ where, data, include }: any) {
        for (const [key, record] of registrations.entries()) {
          if (record.id === where.id) {
            Object.assign(record, data, { updatedAt: new Date() });
            if (include?.user) {
              const u = users.get(record.userId);
              record.user = { id: u.id, name: u.name, email: u.email };
            }
            if (include?.event) {
              const e = events.get(record.eventId);
              record.event = { id: e.id, name: e.name || e.title, date: e.date, status: e.status || (e.isCancelled ? EventStatus.CANCELLED : EventStatus.ACTIVE), capacity: e.capacity };
            }
            registrations.set(key, record);
            return record;
          }
        }
        throw new Error("Record to update not found");
      },
    },
  };
}

// -----------------------------------------------------------------------------
// Test Setup Helpers
// -----------------------------------------------------------------------------

function seedData(db: ReturnType<typeof createMockDb>) {
  // Participant Amit Rao (from Test Case UT_01)
  db.users.set("user_amit", {
    id: "user_amit",
    name: "Amit Rao",
    email: "amit.rao@test.com",
    role: "PARTICIPANT",
    verified: true,
    suspended: false,
    createdAt: new Date("2026-10-01T00:00:00Z"),
  });

  // Participant Priya Nair (from Test Case ST_01)
  db.users.set("user_priya", {
    id: "user_priya",
    name: "Priya Nair",
    email: "priya.nair@test.com",
    role: "PARTICIPANT",
    verified: true,
    suspended: false,
    createdAt: new Date("2026-10-01T00:00:00Z"),
  });

  // Participant Rahul Verma (from Test Case IT_01 / ST_01)
  db.users.set("user_rahul", {
    id: "user_rahul",
    name: "Rahul Verma",
    email: "rahul.verma@test.com",
    role: "PARTICIPANT",
    verified: true,
    suspended: false,
    createdAt: new Date("2026-10-01T00:00:00Z"),
  });

  // Participant Sneha Patel
  db.users.set("user_sneha", {
    id: "user_sneha",
    name: "Sneha Patel",
    email: "sneha.patel@test.com",
    role: "PARTICIPANT",
    verified: true,
    suspended: false,
    createdAt: new Date("2026-10-01T00:00:00Z"),
  });

  // Suspended user
  db.users.set("user_suspended", {
    id: "user_suspended",
    name: "Suspended User",
    email: "suspended@test.com",
    role: "PARTICIPANT",
    verified: true,
    suspended: true,
    createdAt: new Date("2026-10-01T00:00:00Z"),
  });

  // Active Event: Tech Fest (from Test Case UT_01, UT_02)
  db.events.set("event_tech_fest", {
    id: "event_tech_fest",
    name: "Tech Fest",
    title: "Tech Fest",
    description: "Annual technology fest and workshops.",
    date: new Date("2026-10-10T10:00:00Z"),
    time: "10:00 AM",
    venue: "Main Auditorium",
    category: "Tech",
    capacity: 100,
    status: EventStatus.ACTIVE,
    isCancelled: false,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  });

  // Cancelled Event: Old Meetup (from Test Case ST_02)
  db.events.set("event_old_meetup", {
    id: "event_old_meetup",
    name: "Old Meetup",
    title: "Old Meetup",
    description: "Past meetup event.",
    date: new Date("2026-09-01T10:00:00Z"),
    time: "10:00 AM",
    venue: "Hall C",
    category: "Tech",
    capacity: 50,
    status: EventStatus.CANCELLED,
    isCancelled: true,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
  });
}

function seedFR008Data(db: ReturnType<typeof createMockDb>) {
  seedData(db);

  // Full Event: Full Seminar (from FR-008 UT_01: capacity 1, pre-filled with 1 registration)
  db.events.set("event_full_seminar", {
    id: "event_full_seminar",
    name: "Full Seminar",
    title: "Full Seminar",
    description: "Fully booked seminar with 0 seats remaining.",
    date: new Date("2026-10-20T10:00:00Z"),
    time: "10:00 AM",
    venue: "Room 101",
    category: "Academic",
    capacity: 1,
    status: EventStatus.ACTIVE,
    isCancelled: false,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  });
  db.registrations.set("user_amit_event_full_seminar", {
    id: "reg_seed_full_amit",
    userId: "user_amit",
    eventId: "event_full_seminar",
    status: RegistrationStatus.CONFIRMED,
    createdAt: new Date("2026-10-02T00:00:00Z"),
    updatedAt: new Date("2026-10-02T00:00:00Z"),
  });

  // Almost Full Event: Almost Full Talk (from FR-008 UT_02 / IT_01 / IT_02: capacity 2, 1 confirmed, 1 remaining)
  db.events.set("event_almost_full_talk", {
    id: "event_almost_full_talk",
    name: "Almost Full Talk",
    title: "Almost Full Talk",
    description: "Keynote talk with 1 seat remaining.",
    date: new Date("2026-10-25T14:00:00Z"),
    time: "02:00 PM",
    venue: "Auditorium B",
    category: "Tech",
    capacity: 2,
    status: EventStatus.ACTIVE,
    isCancelled: false,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  });
  db.registrations.set("user_amit_event_almost_full_talk", {
    id: "reg_seed_almost_amit",
    userId: "user_amit",
    eventId: "event_almost_full_talk",
    status: RegistrationStatus.CONFIRMED,
    createdAt: new Date("2026-10-02T00:00:00Z"),
    updatedAt: new Date("2026-10-02T00:00:00Z"),
  });

  // 1-Seat Event for Concurrency: Final Seat Test (from FR-008 ST_01: capacity 1, 0 confirmed, 1 seat remaining)
  db.events.set("event_final_seat", {
    id: "event_final_seat",
    name: "Final Seat Test",
    title: "Final Seat Test",
    description: "1-seat event under high concurrency contention.",
    date: new Date("2026-11-01T10:00:00Z"),
    time: "10:00 AM",
    venue: "Lab 1",
    category: "Tech",
    capacity: 1,
    status: EventStatus.ACTIVE,
    isCancelled: false,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  });
}

test.beforeEach(() => {
  clearEventLocks();
});

// -----------------------------------------------------------------------------
// FR-007 Test Suites
// -----------------------------------------------------------------------------

test("FR-007 / UT_01: Verify a valid registration creates a record with correct user, event, timestamp, and status", async () => {
  const db = createMockDb();
  seedData(db);

  const result = await registerForEvent(
    {
      userId: "user_amit",
      eventId: "event_tech_fest",
    },
    db
  );

  assert.equal(result.success, true);
  assert.equal(result.statusCode, 201);
  assert.ok(result.registration, "Registration record should be returned");

  // Acceptance Criteria: Valid registration creates exactly one record (user, event, timestamp, status)
  assert.equal(result.registration.userId, "user_amit");
  assert.equal(result.registration.eventId, "event_tech_fest");
  assert.equal(result.registration.status, "confirmed");
  assert.ok(result.registration.timestamp instanceof Date, "timestamp must be a valid Date");
  assert.ok(result.registration.createdAt instanceof Date, "createdAt must be a valid Date");
  assert.ok(result.registration.id, "Registration must have a unique ID");

  // Verify DB state: exactly 1 record created
  assert.equal(db.registrations.size, 1);
  const stored = db.registrations.get("user_amit_event_tech_fest");
  assert.ok(stored);
  assert.equal(stored.userId, "user_amit");
  assert.equal(stored.eventId, "event_tech_fest");
  assert.equal(stored.status, RegistrationStatus.CONFIRMED);
});

test("FR-007 / UT_01: Verify registration via userEmail lookup creates correct record", async () => {
  const db = createMockDb();
  seedData(db);

  const result = await registerForEvent(
    {
      userEmail: "amit.rao@test.com",
      eventId: "event_tech_fest",
    },
    db
  );

  assert.equal(result.success, true);
  assert.equal(result.statusCode, 201);
  assert.equal(result.registration?.userId, "user_amit");
  assert.equal(result.registration?.status, "confirmed");
  assert.equal(db.registrations.size, 1);
});

test("FR-007 / UT_02: Verify duplicate registration by the same user for the same event is rejected", async () => {
  const db = createMockDb();
  seedData(db);

  // First registration succeeds
  const first = await registerForEvent(
    {
      userId: "user_amit",
      eventId: "event_tech_fest",
    },
    db
  );
  assert.equal(first.success, true);
  assert.equal(first.statusCode, 201);
  assert.equal(db.registrations.size, 1);

  // Second registration attempt for same user + same event
  const second = await registerForEvent(
    {
      userId: "user_amit",
      eventId: "event_tech_fest",
    },
    db
  );

  assert.equal(second.success, false);
  assert.equal(second.statusCode, 409);
  assert.equal(second.error, DUPLICATE_REGISTRATION_ERROR);
  assert.match(second.error, /already registered/i);

  // Ensure no duplicate record was created
  assert.equal(db.registrations.size, 1, "Exactly one record must remain in the database");
});

test("FR-007 / ST_02: Verify registering for a cancelled event is rejected", async () => {
  const db = createMockDb();
  seedData(db);

  const result = await registerForEvent(
    {
      userId: "user_amit",
      eventId: "event_old_meetup", // Cancelled event
    },
    db
  );

  assert.equal(result.success, false);
  assert.equal(result.statusCode, 400);
  assert.equal(result.error, EVENT_CANCELLED_ERROR);
  assert.equal(db.registrations.size, 0, "No record should be created for a cancelled event");
});

test("FR-007 / ST_02: Verify registering for a non-existent event is rejected", async () => {
  const db = createMockDb();
  seedData(db);

  const result = await registerForEvent(
    {
      userId: "user_amit",
      eventId: "non_existent_event_id",
    },
    db
  );

  assert.equal(result.success, false);
  assert.equal(result.statusCode, 404);
  assert.equal(result.error, EVENT_NOT_FOUND_ERROR);
  assert.equal(db.registrations.size, 0);
});

test("FR-007 / NFR-002: Concurrent duplicate registrations create exactly 1 record and reject all others (atomic race condition)", async () => {
  const db = createMockDb();
  seedData(db);

  // Simulate 50 concurrent duplicate requests arriving at the exact same millisecond
  const CONCURRENT_REQUESTS = 50;
  const requests = Array.from({ length: CONCURRENT_REQUESTS }).map(() =>
    registerForEvent(
      {
        userId: "user_amit",
        eventId: "event_tech_fest",
      },
      db
    )
  );

  const results = await Promise.all(requests);

  const successful = results.filter((r) => r.success && r.statusCode === 201);
  const duplicates = results.filter((r) => !r.success && r.statusCode === 409);

  // Exactly one request confirmed, all other 49 rejected with 409 duplicate error
  assert.equal(successful.length, 1, "Exactly one concurrent request must succeed");
  assert.equal(duplicates.length, CONCURRENT_REQUESTS - 1, "All other requests must be rejected as duplicate");
  for (const d of duplicates) {
    assert.equal(d.error, DUPLICATE_REGISTRATION_ERROR);
  }

  // Exactly one record exists in database
  assert.equal(db.registrations.size, 1, "Database must contain exactly 1 registration row");
});

test("FR-007: Multiple different users can register for the same event without interfering", async () => {
  const db = createMockDb();
  seedData(db);

  const res1 = await registerForEvent({ userId: "user_amit", eventId: "event_tech_fest" }, db);
  const res2 = await registerForEvent({ userId: "user_priya", eventId: "event_tech_fest" }, db);

  assert.equal(res1.success, true);
  assert.equal(res2.success, true);
  assert.equal(db.registrations.size, 2);

  // But trying to register Priya again fails with duplicate error
  const res2Duplicate = await registerForEvent({ userId: "user_priya", eventId: "event_tech_fest" }, db);
  assert.equal(res2Duplicate.success, false);
  assert.equal(res2Duplicate.statusCode, 409);
  assert.equal(db.registrations.size, 2);
});

test("FR-007: Re-registering after self-cancellation reactivates registration to confirmed status", async () => {
  const db = createMockDb();
  seedData(db);

  // 1. Initial registration
  const first = await registerForEvent({ userId: "user_amit", eventId: "event_tech_fest" }, db);
  assert.equal(first.success, true);

  // 2. Simulate cancellation
  const key = "user_amit_event_tech_fest";
  const reg = db.registrations.get(key);
  reg.status = RegistrationStatus.CANCELLED;

  // 3. User re-registers
  const second = await registerForEvent({ userId: "user_amit", eventId: "event_tech_fest" }, db);
  assert.equal(second.success, true);
  assert.equal(second.statusCode, 201);
  assert.equal(second.registration?.status, "confirmed");
  assert.equal(db.registrations.size, 1);
});

test("FR-007: Validation & Access Control - Unauthenticated request is rejected with 401", async () => {
  const db = createMockDb();
  seedData(db);

  const result = await registerForEvent({ eventId: "event_tech_fest" }, db);
  assert.equal(result.success, false);
  assert.equal(result.statusCode, 401);
  assert.equal(result.error, AUTH_REQUIRED_ERROR);
});

test("FR-007: Validation & Access Control - Suspended user is rejected with 403", async () => {
  const db = createMockDb();
  seedData(db);

  const result = await registerForEvent(
    {
      userId: "user_suspended",
      eventId: "event_tech_fest",
    },
    db
  );

  assert.equal(result.success, false);
  assert.equal(result.statusCode, 403);
  assert.equal(result.error, USER_SUSPENDED_ERROR);
});

test("FR-007: Validation & Access Control - Non-existent user is rejected with 404", async () => {
  const db = createMockDb();
  seedData(db);

  const result = await registerForEvent(
    {
      userId: "ghost_user",
      eventId: "event_tech_fest",
    },
    db
  );

  assert.equal(result.success, false);
  assert.equal(result.statusCode, 404);
  assert.equal(result.error, USER_NOT_FOUND_ERROR);
});

test("FR-007: Validation & Access Control - Empty eventId is rejected with 400", async () => {
  const db = createMockDb();
  seedData(db);

  const result = await registerForEvent(
    {
      userId: "user_amit",
      eventId: "   ",
    },
    db
  );

  assert.equal(result.success, false);
  assert.equal(result.statusCode, 400);
});

test("FR-007: checkUserRegistration helper returns accurate registration state", async () => {
  const db = createMockDb();
  seedData(db);

  // Before registration
  const checkBefore = await checkUserRegistration("user_amit", "event_tech_fest", db);
  assert.equal(checkBefore.registered, false);
  assert.equal(checkBefore.registration, null);

  // After registration
  await registerForEvent({ userId: "user_amit", eventId: "event_tech_fest" }, db);
  const checkAfter = await checkUserRegistration("user_amit", "event_tech_fest", db);
  assert.equal(checkAfter.registered, true);
  assert.equal(checkAfter.registration?.status, "confirmed");
  assert.equal(checkAfter.registration?.userId, "user_amit");
  assert.equal(checkAfter.registration?.eventId, "event_tech_fest");
});

// -----------------------------------------------------------------------------
// FR-008 Test Suites (Capacity check & Overbooking prevention)
// -----------------------------------------------------------------------------

test("FR-008 / UT_01: Verify registration is rejected when the event has zero available seats (Full Seminar)", async () => {
  const db = createMockDb();
  seedFR008Data(db);

  // Pre-condition: event_full_seminar has capacity=1 and 1 confirmed registration (user_amit)
  const capBefore = await getEventCapacity("event_full_seminar", db);
  assert.ok(capBefore);
  assert.equal(capBefore.capacity, 1);
  assert.equal(capBefore.confirmedCount, 1);
  assert.equal(capBefore.remainingSeats, 0);
  assert.equal(capBefore.isFull, true);

  // Action: Another user (Priya Nair) attempts to register for the full event
  const result = await registerForEvent(
    {
      userId: "user_priya",
      eventId: "event_full_seminar",
    },
    db
  );

  // Expected: Registration is rejected with an 'event full' message; seat count remains 0
  assert.equal(result.success, false);
  assert.equal(result.statusCode, 400);
  assert.equal(result.error, EVENT_FULL_ERROR);
  assert.equal(result.remainingSeats, 0);
  assert.match(result.error, /event.*full/i);

  // Seat count remains 0, confirmedCount remains 1
  const capAfter = await getEventCapacity("event_full_seminar", db);
  assert.ok(capAfter);
  assert.equal(capAfter.confirmedCount, 1);
  assert.equal(capAfter.remainingSeats, 0);
  assert.equal(capAfter.isFull, true);
});

test("FR-008 / UT_02: Verify registration succeeds and decrements the seat count when a seat is available (Almost Full Talk)", async () => {
  const db = createMockDb();
  seedFR008Data(db);

  // Pre-condition: event_almost_full_talk has capacity=2 and 1 confirmed registration (1 seat left)
  const capBefore = await getEventCapacity("event_almost_full_talk", db);
  assert.ok(capBefore);
  assert.equal(capBefore.capacity, 2);
  assert.equal(capBefore.confirmedCount, 1);
  assert.equal(capBefore.remainingSeats, 1);
  assert.equal(capBefore.isFull, false);

  // Action: Register for the event (Priya Nair)
  const result = await registerForEvent(
    {
      userId: "user_priya",
      eventId: "event_almost_full_talk",
    },
    db
  );

  // Expected: Registration succeeds; seat count becomes 0 immediately after
  assert.equal(result.success, true);
  assert.equal(result.statusCode, 201);
  assert.equal(result.remainingSeats, 0);
  assert.equal(result.registration?.status, "confirmed");

  // Verify seat count becomes 0 immediately after
  const capAfter = await getEventCapacity("event_almost_full_talk", db);
  assert.ok(capAfter);
  assert.equal(capAfter.confirmedCount, 2);
  assert.equal(capAfter.remainingSeats, 0);
  assert.equal(capAfter.isFull, true);
});

test("FR-008 / IT_01: Concurrency Control - Verify only one of two simultaneous requests for the last seat is confirmed", async () => {
  const db = createMockDb();
  seedFR008Data(db);

  // Pre-condition: event_almost_full_talk has capacity=2 and 1 seat remaining
  // Users: user_priya and user_c
  db.users.set("user_c", {
    id: "user_c",
    name: "User C",
    email: "user.c@test.com",
    role: "PARTICIPANT",
    verified: true,
    suspended: false,
    createdAt: new Date(),
  });

  // Action: Fire two registration requests for the same event at the same time
  const [res1, res2] = await Promise.all([
    registerForEvent({ userId: "user_priya", eventId: "event_almost_full_talk" }, db),
    registerForEvent({ userId: "user_c", eventId: "event_almost_full_talk" }, db),
  ]);

  // Expected: Exactly one request is confirmed; the other is rejected as 'event full'
  const successful = [res1, res2].filter((r) => r.success && r.statusCode === 201);
  const rejected = [res1, res2].filter((r) => !r.success && r.statusCode === 400);

  assert.equal(successful.length, 1, "Exactly one request must be confirmed");
  assert.equal(rejected.length, 1, "The other request must be rejected as 'event full'");
  assert.equal(rejected[0].error, EVENT_FULL_ERROR);

  // Final seat count is 0, exactly 2 registrations confirmed (out of 2 capacity)
  const capFinal = await getEventCapacity("event_almost_full_talk", db);
  assert.ok(capFinal);
  assert.equal(capFinal.confirmedCount, 2);
  assert.equal(capFinal.remainingSeats, 0);
});

test("FR-008 / IT_02: Concurrency Control - Verify seat capacity never goes negative under a simulated race condition", async () => {
  const db = createMockDb();
  seedFR008Data(db);

  // Pre-condition: event_final_seat has capacity=1 and 1 seat remaining
  // Action: Fire 10 simultaneous registration requests for 10 distinct users
  const CONCURRENT_USERS = 10;
  for (let i = 1; i <= CONCURRENT_USERS; i++) {
    db.users.set(`user_race_${i}`, {
      id: `user_race_${i}`,
      name: `Race User ${i}`,
      email: `race${i}@test.com`,
      role: "PARTICIPANT",
      verified: true,
      suspended: false,
      createdAt: new Date(),
    });
  }

  const requests = Array.from({ length: CONCURRENT_USERS }).map((_, i) =>
    registerForEvent(
      {
        userId: `user_race_${i + 1}`,
        eventId: "event_final_seat",
      },
      db
    )
  );

  const results = await Promise.all(requests);

  // Expected: Final seat count is 0, never negative; exactly one registration is confirmed
  const confirmed = results.filter((r) => r.success && r.statusCode === 201);
  const rejected = results.filter((r) => !r.success && r.statusCode === 400);

  assert.equal(confirmed.length, 1, "Exactly one registration must be confirmed");
  assert.equal(rejected.length, CONCURRENT_USERS - 1, "All 9 other requests must be rejected");
  for (const r of rejected) {
    assert.equal(r.error, EVENT_FULL_ERROR);
    assert.equal(r.remainingSeats, 0);
  }

  const cap = await getEventCapacity("event_final_seat", db);
  assert.ok(cap);
  assert.equal(cap.confirmedCount, 1);
  assert.equal(cap.remainingSeats, 0, "Seat count must be exactly 0, never negative");
  assert.ok(cap.remainingSeats >= 0, "Remaining capacity must never be negative");
});

test("FR-008 / ST_01: Load Test / Concurrency - Verify 100 concurrent requests for a 1-seat event yield exactly one confirmation", async () => {
  const db = createMockDb();
  seedFR008Data(db);

  // Pre-condition: event_final_seat has capacity=1 and 0 registrations (1 seat left)
  const CONCURRENT_REQUESTS = 100;

  // Seed 100 distinct users
  for (let i = 1; i <= CONCURRENT_REQUESTS; i++) {
    db.users.set(`load_user_${i}`, {
      id: `load_user_${i}`,
      name: `Load User ${i}`,
      email: `load${i}@test.com`,
      role: "PARTICIPANT",
      verified: true,
      suspended: false,
      createdAt: new Date(),
    });
  }

  // Action: Fire 100 simultaneous registration requests
  const requests = Array.from({ length: CONCURRENT_REQUESTS }).map((_, i) =>
    registerForEvent(
      {
        userId: `load_user_${i + 1}`,
        eventId: "event_final_seat",
      },
      db
    )
  );

  const results = await Promise.all(requests);

  // Expected: Exactly 1 confirmation and 99 rejections are recorded; no overbooking occurs
  const successful = results.filter((r) => r.success && r.statusCode === 201);
  const rejected = results.filter((r) => !r.success && r.statusCode === 400);

  assert.equal(successful.length, 1, "Exactly 1 confirmation must occur for a 1-seat event under 100 simultaneous requests");
  assert.equal(rejected.length, 99, "Exactly 99 rejections must occur");

  for (const r of rejected) {
    assert.equal(r.error, EVENT_FULL_ERROR);
    assert.equal(r.remainingSeats, 0);
  }

  // Verify DB state: exactly 1 confirmed registration exists for event_final_seat
  const confirmedInDb = (await db.registration.findMany({ where: { eventId: "event_final_seat" } }))
    .filter((r: any) => r.status === RegistrationStatus.CONFIRMED);
  assert.equal(confirmedInDb.length, 1, "Database must record exactly 1 confirmed registration; no overbooking");

  const cap = await getEventCapacity("event_final_seat", db);
  assert.ok(cap);
  assert.equal(cap.confirmedCount, 1);
  assert.equal(cap.remainingSeats, 0);
  assert.equal(cap.isFull, true);
});

test("FR-008: Overbooking Prevention - Verify event with capacity N accepts exactly N registrations and rejects all subsequent requests", async () => {
  const db = createMockDb();
  seedFR008Data(db);

  // Event with capacity 5
  db.events.set("event_cap_5", {
    id: "event_cap_5",
    name: "Workshop of 5",
    title: "Workshop of 5",
    description: "5 seats workshop",
    date: new Date("2026-11-05T10:00:00Z"),
    time: "10:00 AM",
    venue: "Lab 2",
    category: "Tech",
    capacity: 5,
    status: EventStatus.ACTIVE,
    isCancelled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 15 distinct users attempt to register
  for (let i = 1; i <= 15; i++) {
    db.users.set(`user_multi_${i}`, {
      id: `user_multi_${i}`,
      name: `Multi User ${i}`,
      email: `multi${i}@test.com`,
      role: "PARTICIPANT",
      verified: true,
      suspended: false,
      createdAt: new Date(),
    });
  }

  const requests = Array.from({ length: 15 }).map((_, i) =>
    registerForEvent(
      {
        userId: `user_multi_${i + 1}`,
        eventId: "event_cap_5",
      },
      db
    )
  );

  const results = await Promise.all(requests);

  const successful = results.filter((r) => r.success && r.statusCode === 201);
  const rejected = results.filter((r) => !r.success && r.statusCode === 400);

  // Exactly 5 confirm, exactly 10 reject
  assert.equal(successful.length, 5, "Exactly 5 registrations must succeed for a 5-capacity event");
  assert.equal(rejected.length, 10, "Subsequent 10 requests must be rejected as full");

  const cap = await getEventCapacity("event_cap_5", db);
  assert.ok(cap);
  assert.equal(cap.confirmedCount, 5);
  assert.equal(cap.remainingSeats, 0);
  assert.equal(cap.isFull, true);
});

test("FR-008: Capacity check prevents re-registering cancelled registration if event became full", async () => {
  const db = createMockDb();
  seedFR008Data(db);

  // Event with capacity 1
  db.events.set("event_re_reg_cap", {
    id: "event_re_reg_cap",
    name: "Single Seat",
    title: "Single Seat",
    date: new Date("2026-11-10T10:00:00Z"),
    time: "10:00 AM",
    venue: "Lab",
    category: "Tech",
    capacity: 1,
    status: EventStatus.ACTIVE,
    isCancelled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 1. User Amit registers (consumes seat: 1/1)
  const reg1 = await registerForEvent({ userId: "user_amit", eventId: "event_re_reg_cap" }, db);
  assert.equal(reg1.success, true);

  // 2. User Amit cancels registration
  const amitKey = "user_amit_event_re_reg_cap";
  const amitRecord = db.registrations.get(amitKey);
  amitRecord.status = RegistrationStatus.CANCELLED;

  // 3. User Priya registers and claims the freed seat (1/1)
  const reg2 = await registerForEvent({ userId: "user_priya", eventId: "event_re_reg_cap" }, db);
  assert.equal(reg2.success, true);
  assert.equal(reg2.statusCode, 201);

  // 4. User Amit now attempts to reactivate cancelled registration when event is full
  const reRegisterResult = await registerForEvent({ userId: "user_amit", eventId: "event_re_reg_cap" }, db);
  assert.equal(reRegisterResult.success, false);
  assert.equal(reRegisterResult.statusCode, 400);
  assert.equal(reRegisterResult.error, EVENT_FULL_ERROR);

  // DB confirmed count must still be exactly 1
  const cap = await getEventCapacity("event_re_reg_cap", db);
  assert.ok(cap);
  assert.equal(cap.confirmedCount, 1);
  assert.equal(cap.remainingSeats, 0);
});

test("FR-008: Duplicate check takes precedence over capacity check for already registered users", async () => {
  const db = createMockDb();
  seedFR008Data(db);

  // event_full_seminar is full (capacity: 1, user_amit confirmed)
  // When user_amit tries to register again, duplicate error (409) is returned, NOT 400 full
  const res = await registerForEvent({ userId: "user_amit", eventId: "event_full_seminar" }, db);
  assert.equal(res.success, false);
  assert.equal(res.statusCode, 409);
  assert.equal(res.error, DUPLICATE_REGISTRATION_ERROR);
});

test("FR-008: getEventCapacity helper returns accurate capacity, confirmedCount, remainingSeats, and isFull", async () => {
  const db = createMockDb();
  seedFR008Data(db);

  // Non-existent event returns null
  const nonExistent = await getEventCapacity("ghost_event", db);
  assert.equal(nonExistent, null);

  // Tech fest (capacity: 100, 0 confirmed)
  const techFestCap = await getEventCapacity("event_tech_fest", db);
  assert.ok(techFestCap);
  assert.equal(techFestCap.capacity, 100);
  assert.equal(techFestCap.confirmedCount, 0);
  assert.equal(techFestCap.remainingSeats, 100);
  assert.equal(techFestCap.isFull, false);

  // Almost full talk (capacity: 2, 1 confirmed)
  const almostFullCap = await getEventCapacity("event_almost_full_talk", db);
  assert.ok(almostFullCap);
  assert.equal(almostFullCap.capacity, 2);
  assert.equal(almostFullCap.confirmedCount, 1);
  assert.equal(almostFullCap.remainingSeats, 1);
  assert.equal(almostFullCap.isFull, false);

  // Full seminar (capacity: 1, 1 confirmed)
  const fullCap = await getEventCapacity("event_full_seminar", db);
  assert.ok(fullCap);
  assert.equal(fullCap.capacity, 1);
  assert.equal(fullCap.confirmedCount, 1);
  assert.equal(fullCap.remainingSeats, 0);
  assert.equal(fullCap.isFull, true);
});

// -----------------------------------------------------------------------------
// FR-009a Test Suites (Waitlist with auto-promotion on cancellation)
// -----------------------------------------------------------------------------

test("FR-009a / UT_01: Verify joining a waitlist records the user's position for a full event", async () => {
  const db = createMockDb();
  seedFR008Data(db);

  // Pre-condition: event_full_seminar has capacity=1 and 1 confirmed registration (user_amit)
  const capBefore = await getEventCapacity("event_full_seminar", db);
  assert.ok(capBefore);
  assert.equal(capBefore.isFull, true);
  assert.equal(capBefore.remainingSeats, 0);

  // Action 1: Priya joins waitlist for full seminar
  const priyaResult = await joinWaitlist(
    {
      userId: "user_priya",
      eventId: "event_full_seminar",
    },
    db
  );

  // Expected 1: Priya is added to the waitlist and shown queue position 1
  assert.equal(priyaResult.success, true);
  assert.equal(priyaResult.statusCode, 201);
  assert.equal(priyaResult.waitlistPosition, 1);
  assert.equal(priyaResult.registration?.status, "waitlisted");
  assert.equal(priyaResult.registration?.userId, "user_priya");

  // Action 2: Rahul joins waitlist for the same full seminar
  const rahulResult = await joinWaitlist(
    {
      userId: "user_rahul",
      eventId: "event_full_seminar",
    },
    db
  );

  // Expected 2: Rahul is added to waitlist at position 2
  assert.equal(rahulResult.success, true);
  assert.equal(rahulResult.statusCode, 201);
  assert.equal(rahulResult.waitlistPosition, 2);
  assert.equal(rahulResult.registration?.status, "waitlisted");

  // Total waitlist count is 2
  const waitlistCount = await getWaitlistCount("event_full_seminar", db);
  assert.equal(waitlistCount, 2);

  // Check registration helper returns accurate position
  const priyaCheck = await checkUserRegistration("user_priya", "event_full_seminar", db);
  assert.equal(priyaCheck.registered, true);
  assert.equal(priyaCheck.isWaitlisted, true);
  assert.equal(priyaCheck.waitlistPosition, 1);

  const rahulCheck = await checkUserRegistration("user_rahul", "event_full_seminar", db);
  assert.equal(rahulCheck.registered, true);
  assert.equal(rahulCheck.isWaitlisted, true);
  assert.equal(rahulCheck.waitlistPosition, 2);
});

test("FR-009a / UT_02: Verify a participant can cancel their registration and free a seat", async () => {
  const db = createMockDb();
  seedData(db);

  // 1. Amit registers for Tech Fest (capacity: 100)
  const reg = await registerForEvent({ userId: "user_amit", eventId: "event_tech_fest" }, db);
  assert.equal(reg.success, true);
  assert.equal(reg.statusCode, 201);

  const capAfterReg = await getEventCapacity("event_tech_fest", db);
  assert.equal(capAfterReg?.confirmedCount, 1);
  assert.equal(capAfterReg?.remainingSeats, 99);

  // 2. Amit cancels registration
  const cancelResult = await cancelRegistration(
    {
      userId: "user_amit",
      eventId: "event_tech_fest",
    },
    db
  );

  assert.equal(cancelResult.success, true);
  assert.equal(cancelResult.statusCode, 200);
  assert.equal(cancelResult.registration?.status, "cancelled");
  assert.equal(cancelResult.remainingSeats, 100);

  // Seat count increases by 1 back to 100
  const capAfterCancel = await getEventCapacity("event_tech_fest", db);
  assert.equal(capAfterCancel?.confirmedCount, 0);
  assert.equal(capAfterCancel?.remainingSeats, 100);

  // Check checkUserRegistration reflects cancelled state
  const check = await checkUserRegistration("user_amit", "event_tech_fest", db);
  assert.equal(check.registered, false);
});

test("FR-009a / IT_01: Verify a cancellation automatically promotes the first waitlisted user", async () => {
  const db = createMockDb();
  seedFR008Data(db);

  // Event: event_full_seminar (capacity 1, Amit is registered)
  // Priya joins waitlist (position 1)
  const w1 = await joinWaitlist({ userId: "user_priya", eventId: "event_full_seminar" }, db);
  assert.equal(w1.waitlistPosition, 1);

  // Rahul joins waitlist (position 2)
  const w2 = await joinWaitlist({ userId: "user_rahul", eventId: "event_full_seminar" }, db);
  assert.equal(w2.waitlistPosition, 2);

  // Listen for promotion notifications
  const dispatchedNotifications: any[] = [];
  const unsubscribe = onWaitlistNotification((n) => {
    dispatchedNotifications.push(n);
  });

  try {
    // Action: Amit cancels his registration
    const cancelRes = await cancelRegistration(
      {
        userId: "user_amit",
        eventId: "event_full_seminar",
      },
      db
    );

    // Expected: Amit's registration is cancelled
    assert.equal(cancelRes.success, true);
    assert.equal(cancelRes.registration?.status, "cancelled");

    // First waitlisted user (Priya) is auto-promoted to CONFIRMED
    assert.ok(cancelRes.promotedRegistration);
    assert.equal(cancelRes.promotedRegistration.userId, "user_priya");
    assert.equal(cancelRes.promotedRegistration.status, "confirmed");

    // Priya's status in DB is now CONFIRMED
    const priyaCheck = await checkUserRegistration("user_priya", "event_full_seminar", db);
    assert.equal(priyaCheck.registered, true);
    assert.equal(priyaCheck.isWaitlisted, false);
    assert.equal(priyaCheck.registration?.status, "confirmed");

    // Rahul is now waitlist position 1
    const rahulCheck = await checkUserRegistration("user_rahul", "event_full_seminar", db);
    assert.equal(rahulCheck.registered, true);
    assert.equal(rahulCheck.isWaitlisted, true);
    assert.equal(rahulCheck.waitlistPosition, 1);

    // Notification was dispatched immediately to Priya
    assert.equal(dispatchedNotifications.length, 1);
    assert.equal(dispatchedNotifications[0].to, "priya.nair@test.com");
    assert.equal(dispatchedNotifications[0].userId, "user_priya");
    assert.equal(dispatchedNotifications[0].eventId, "event_full_seminar");
    assert.equal(dispatchedNotifications[0].type, "WAITLIST_PROMOTION");
    assert.match(dispatchedNotifications[0].subject, /promoted/i);
  } finally {
    unsubscribe();
  }
});

test("FR-009a / ST_01: End-to-End Waitlist Flow: Verify a waitlisted user is auto-promoted and notified when a seat frees up", async () => {
  const db = createMockDb();
  seedFR008Data(db);

  // Pre-condition: Event is full; Participant Y (Amit) is registered
  // Participant X (Priya) joins waitlist
  const priyaWaitlist = await joinWaitlist({ userId: "user_priya", eventId: "event_full_seminar" }, db);
  assert.equal(priyaWaitlist.success, true);
  assert.equal(priyaWaitlist.registration?.status, "waitlisted");

  const notifications: any[] = [];
  const unsubscribe = onWaitlistNotification((n) => { notifications.push(n); });

  try {
    // Participant Y (Amit) cancels registration
    const cancel = await cancelRegistration({ userId: "user_amit", eventId: "event_full_seminar" }, db);
    assert.equal(cancel.success, true);

    // Participant X's status becomes 'confirmed' and they receive promotion notification
    const priyaState = await checkUserRegistration("user_priya", "event_full_seminar", db);
    assert.equal(priyaState.registered, true);
    assert.equal(priyaState.isWaitlisted, false);
    assert.equal(priyaState.registration?.status, "confirmed");

    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].to, "priya.nair@test.com");
    assert.match(notifications[0].subject, /promoted from the waitlist/i);
  } finally {
    unsubscribe();
  }
});

test("FR-009a / NFR-002: Waitlist entries are recorded in order joined (FIFO queue)", async () => {
  const db = createMockDb();
  seedFR008Data(db);

  // event_full_seminar is full (capacity 1, Amit registered)
  // Join Priya (t1), Rahul (t2), Sneha (t3)
  const resPriya = await joinWaitlist({ userId: "user_priya", eventId: "event_full_seminar" }, db);
  const resRahul = await joinWaitlist({ userId: "user_rahul", eventId: "event_full_seminar" }, db);
  const resSneha = await joinWaitlist({ userId: "user_sneha", eventId: "event_full_seminar" }, db);

  assert.equal(resPriya.waitlistPosition, 1);
  assert.equal(resRahul.waitlistPosition, 2);
  assert.equal(resSneha.waitlistPosition, 3);

  // Amit cancels -> Priya promoted (first in line)
  const cancel1 = await cancelRegistration({ userId: "user_amit", eventId: "event_full_seminar" }, db);
  assert.equal(cancel1.promotedRegistration?.userId, "user_priya");

  // Remaining queue: Rahul is pos 1, Sneha is pos 2
  assert.equal(await getWaitlistPosition("user_rahul", "event_full_seminar", db), 1);
  assert.equal(await getWaitlistPosition("user_sneha", "event_full_seminar", db), 2);

  // Priya cancels -> Rahul promoted (next in line)
  const cancel2 = await cancelRegistration({ userId: "user_priya", eventId: "event_full_seminar" }, db);
  assert.equal(cancel2.promotedRegistration?.userId, "user_rahul");

  // Remaining queue: Sneha is pos 1
  assert.equal(await getWaitlistPosition("user_sneha", "event_full_seminar", db), 1);

  // Rahul cancels -> Sneha promoted (last in line)
  const cancel3 = await cancelRegistration({ userId: "user_rahul", eventId: "event_full_seminar" }, db);
  assert.equal(cancel3.promotedRegistration?.userId, "user_sneha");

  // Waitlist is now empty
  assert.equal(await getWaitlistCount("event_full_seminar", db), 0);
});

test("FR-009a / NFR-002: Concurrent waitlist requests maintain data integrity and strict order without race conditions", async () => {
  const db = createMockDb();
  seedFR008Data(db);

  const CONCURRENT = 10;
  for (let i = 1; i <= CONCURRENT; i++) {
    db.users.set(`user_w_${i}`, {
      id: `user_w_${i}`,
      name: `Waitlist User ${i}`,
      email: `w${i}@test.com`,
      role: "PARTICIPANT",
      verified: true,
      suspended: false,
      createdAt: new Date(),
    });
  }

  // 10 concurrent requests to join waitlist for full seminar
  const requests = Array.from({ length: CONCURRENT }).map((_, i) =>
    joinWaitlist({ userId: `user_w_${i + 1}`, eventId: "event_full_seminar" }, db)
  );

  const results = await Promise.all(requests);
  const successes = results.filter((r) => r.success && r.statusCode === 201);
  assert.equal(successes.length, CONCURRENT);

  // All 10 are recorded with unique positions from 1 to 10
  const positions = successes.map((s) => s.waitlistPosition).sort((a, b) => (a ?? 0) - (b ?? 0));
  assert.deepEqual(positions, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  // Total waitlist count is 10
  assert.equal(await getWaitlistCount("event_full_seminar", db), 10);
});

test("FR-009a: Duplicate check prevents already waitlisted user from joining waitlist again", async () => {
  const db = createMockDb();
  seedFR008Data(db);

  // Priya joins waitlist
  const first = await joinWaitlist({ userId: "user_priya", eventId: "event_full_seminar" }, db);
  assert.equal(first.success, true);

  // Priya attempts to join waitlist again
  const second = await joinWaitlist({ userId: "user_priya", eventId: "event_full_seminar" }, db);
  assert.equal(second.success, false);
  assert.equal(second.statusCode, 409);
  assert.equal(second.error, ALREADY_WAITLISTED_ERROR);
});

test("FR-009a: Confirmed user cannot join waitlist", async () => {
  const db = createMockDb();
  seedFR008Data(db);

  // Amit is already confirmed on event_full_seminar
  const result = await joinWaitlist({ userId: "user_amit", eventId: "event_full_seminar" }, db);
  assert.equal(result.success, false);
  assert.equal(result.statusCode, 409);
  assert.equal(result.error, DUPLICATE_REGISTRATION_ERROR);
});

test("FR-009a: Re-joining waitlist after cancelling joins at the end of the queue", async () => {
  const db = createMockDb();
  seedFR008Data(db);

  // 1. Priya joins (pos 1), Rahul joins (pos 2)
  await joinWaitlist({ userId: "user_priya", eventId: "event_full_seminar" }, db);
  await joinWaitlist({ userId: "user_rahul", eventId: "event_full_seminar" }, db);

  assert.equal(await getWaitlistPosition("user_priya", "event_full_seminar", db), 1);
  assert.equal(await getWaitlistPosition("user_rahul", "event_full_seminar", db), 2);

  // 2. Priya cancels her waitlist spot
  const cancel = await cancelRegistration({ userId: "user_priya", eventId: "event_full_seminar" }, db);
  assert.equal(cancel.success, true);

  // Rahul is now position 1
  assert.equal(await getWaitlistPosition("user_rahul", "event_full_seminar", db), 1);

  // 3. Priya rejoins waitlist
  const rejoin = await joinWaitlist({ userId: "user_priya", eventId: "event_full_seminar" }, db);
  assert.equal(rejoin.success, true);
  // Priya is now at the end of the queue (position 2)
  assert.equal(rejoin.waitlistPosition, 2);
  assert.equal(await getWaitlistPosition("user_rahul", "event_full_seminar", db), 1);
  assert.equal(await getWaitlistPosition("user_priya", "event_full_seminar", db), 2);
});

test("FR-009a: Waitlisted user cancelling their own waitlist entry does not alter confirmed seat count or promote anyone", async () => {
  const db = createMockDb();
  seedFR008Data(db);

  await joinWaitlist({ userId: "user_priya", eventId: "event_full_seminar" }, db);

  const notifications: any[] = [];
  const unsubscribe = onWaitlistNotification((n) => { notifications.push(n); });

  try {
    const cancel = await cancelRegistration({ userId: "user_priya", eventId: "event_full_seminar" }, db);
    assert.equal(cancel.success, true);
    assert.equal(cancel.promotedRegistration, undefined);
    assert.equal(notifications.length, 0, "No promotion notification should be dispatched");

    // Event confirmed count is still 1 (Amit), remaining seats is 0
    const cap = await getEventCapacity("event_full_seminar", db);
    assert.equal(cap?.confirmedCount, 1);
    assert.equal(cap?.remainingSeats, 0);
  } finally {
    unsubscribe();
  }
});

test("FR-009a: Cannot join waitlist for a cancelled event", async () => {
  const db = createMockDb();
  seedData(db);

  const res = await joinWaitlist({ userId: "user_amit", eventId: "event_old_meetup" }, db);
  assert.equal(res.success, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.error, EVENT_CANCELLED_ERROR);
});

test("FR-009a: Explicit joinWaitlist on an event with open seats returns error", async () => {
  const db = createMockDb();
  seedData(db);

  // event_tech_fest has 100 seats open
  const res = await joinWaitlist({ userId: "user_amit", eventId: "event_tech_fest" }, db);
  assert.equal(res.success, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.error, EVENT_NOT_FULL_ERROR);
});

test("FR-009a: registerForEvent with waitlist: true joins waitlist when full, or registers confirmed when seats are open", async () => {
  const db = createMockDb();
  seedFR008Data(db);

  // 1. Open seats (event_tech_fest): registers as CONFIRMED even if waitlist: true was passed
  const openRes = await registerForEvent(
    { userId: "user_priya", eventId: "event_tech_fest", waitlist: true },
    db
  );
  assert.equal(openRes.success, true);
  assert.equal(openRes.registration?.status, "confirmed");

  // 2. Full event (event_full_seminar): registers as WAITLISTED when waitlist: true is passed
  const fullRes = await registerForEvent(
    { userId: "user_priya", eventId: "event_full_seminar", waitlist: true },
    db
  );
  assert.equal(fullRes.success, true);
  assert.equal(fullRes.registration?.status, "waitlisted");
  assert.equal(fullRes.waitlistPosition, 1);
});

// -----------------------------------------------------------------------------
// FR-009b Test Suites (Self-cancellation and registration notifications)
// -----------------------------------------------------------------------------

test("FR-009b / UT_02: Self-cancellation updates status to cancelled, increments seat count immediately, and dispatches cancellation email", async () => {
  const db = createMockDb();
  seedData(db);

  // Pre-condition: Priya has an active registration for Tech Fest
  const regResult = await registerForEvent(
    { userId: "user_priya", eventId: "event_tech_fest" },
    db
  );
  assert.equal(regResult.success, true);
  assert.equal(regResult.statusCode, 201);

  const capBefore = await getEventCapacity("event_tech_fest", db);
  assert.equal(capBefore?.confirmedCount, 1);
  assert.equal(capBefore?.remainingSeats, 99);

  // Capture notifications
  const notifications: any[] = [];
  const unsubscribe = onNotification((n) => {
    notifications.push(n);
  });

  try {
    // Action: Priya cancels her registration
    const cancelResult = await cancelRegistration(
      { userId: "user_priya", eventId: "event_tech_fest" },
      db
    );

    // Expected 1: Cancellation succeeds
    assert.equal(cancelResult.success, true);
    assert.equal(cancelResult.statusCode, 200);
    assert.equal(cancelResult.registration?.status, "cancelled");
    assert.equal(cancelResult.remainingSeats, 100);

    // Expected 2: Seat count increases immediately
    const capAfter = await getEventCapacity("event_tech_fest", db);
    assert.equal(capAfter?.confirmedCount, 0);
    assert.equal(capAfter?.remainingSeats, 100);

    // Expected 3: Cancellation confirmation email dispatched to Priya
    const cancelNotification = notifications.find(
      (n) => n.type === "CANCELLATION_CONFIRMATION" && n.userId === "user_priya"
    );
    assert.ok(cancelNotification, "Cancellation confirmation notification must be dispatched");
    assert.equal(cancelNotification.to, "priya.nair@test.com");
    assert.equal(cancelNotification.eventId, "event_tech_fest");
    assert.match(cancelNotification.subject, /cancelled/i);
    assert.match(cancelNotification.subject, /Tech Fest/i);
  } finally {
    unsubscribe();
  }
});

test("FR-009b / IT_02: Successful registration with open seats sends confirmation email immediately", async () => {
  const db = createMockDb();
  seedData(db);

  // Add Workshop A
  db.events.set("event_workshop_a", {
    id: "event_workshop_a",
    name: "Workshop A",
    title: "Workshop A",
    date: new Date("2026-11-05T14:00:00Z"),
    time: "02:00 PM",
    venue: "Auditorium 1",
    category: "Workshops",
    capacity: 20,
    status: EventStatus.ACTIVE,
    isCancelled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const notifications: any[] = [];
  const unsubscribe = onNotification((n) => {
    notifications.push(n);
  });

  try {
    // Action: Priya registers for Workshop A with open seats
    const result = await registerForEvent(
      { userId: "user_priya", eventId: "event_workshop_a" },
      db
    );

    assert.equal(result.success, true);
    assert.equal(result.statusCode, 201);
    assert.equal(result.registration?.status, "confirmed");

    // Expected: A registration confirmation email is sent immediately
    const confirmNotification = notifications.find(
      (n) => n.type === "REGISTRATION_CONFIRMATION" && n.userId === "user_priya"
    );
    assert.ok(confirmNotification, "Confirmation notification must be dispatched immediately");
    assert.equal(confirmNotification.to, "priya.nair@test.com");
    assert.equal(confirmNotification.eventId, "event_workshop_a");
    assert.match(confirmNotification.subject, /confirmed/i);
    assert.match(confirmNotification.subject, /Workshop A/i);
    assert.equal(confirmNotification.details?.eventVenue, "Auditorium 1");
    assert.equal(confirmNotification.details?.eventTime, "02:00 PM");
  } finally {
    unsubscribe();
  }
});

test("FR-009b / ST_02: Scheduled reminder job sends reminder notification to confirmed participants for events starting within 24h", async () => {
  const db = createMockDb();
  seedData(db);

  const baseTime = new Date("2026-10-28T10:00:00Z");

  // Event 1: starts in 18 hours (inside 24h window)
  const eventIn18h = new Date(baseTime.getTime() + 18 * 60 * 60 * 1000);
  db.events.set("evt_starts_in_18h", {
    id: "evt_starts_in_18h",
    name: "Autonomous AI Summit",
    title: "Autonomous AI Summit",
    date: eventIn18h,
    time: "04:00 AM",
    venue: "Innovation Hub",
    category: "Technology",
    capacity: 50,
    status: EventStatus.ACTIVE,
    isCancelled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Event 2: starts in 36 hours (outside 24h window)
  const eventIn36h = new Date(baseTime.getTime() + 36 * 60 * 60 * 1000);
  db.events.set("evt_starts_in_36h", {
    id: "evt_starts_in_36h",
    name: "Future Robotics Meet",
    title: "Future Robotics Meet",
    date: eventIn36h,
    time: "10:00 PM",
    venue: "Robotics Lab",
    category: "Technology",
    capacity: 50,
    status: EventStatus.ACTIVE,
    isCancelled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Register Amit and Priya for Event 1 (inside window)
  await registerForEvent({ userId: "user_amit", eventId: "evt_starts_in_18h" }, db);
  await registerForEvent({ userId: "user_priya", eventId: "evt_starts_in_18h" }, db);

  // Register Rahul for Event 2 (outside window)
  await registerForEvent({ userId: "user_rahul", eventId: "evt_starts_in_36h" }, db);

  const dispatched: any[] = [];
  const unsubscribe = onNotification((n) => {
    dispatched.push(n);
  });

  try {
    // Trigger scheduled reminder job for 24h window
    const result = await sendEventReminders(
      { windowHours: 24, referenceDate: baseTime },
      db
    );

    assert.equal(result.success, true);
    assert.equal(result.eventsProcessed, 1);
    assert.equal(result.remindersSent, 2);

    // Both Amit and Priya received reminders referencing the correct event and time
    const amitReminder = dispatched.find(
      (n) => n.type === "EVENT_REMINDER" && n.userId === "user_amit"
    );
    assert.ok(amitReminder, "Amit must receive reminder email");
    assert.equal(amitReminder.to, "amit.rao@test.com");
    assert.equal(amitReminder.eventId, "evt_starts_in_18h");
    assert.match(amitReminder.subject, /Autonomous AI Summit/i);

    const priyaReminder = dispatched.find(
      (n) => n.type === "EVENT_REMINDER" && n.userId === "user_priya"
    );
    assert.ok(priyaReminder, "Priya must receive reminder email");
    assert.equal(priyaReminder.to, "priya.nair@test.com");
    assert.equal(priyaReminder.eventId, "evt_starts_in_18h");

    // Rahul's event is in 36 hours, so NO reminder was dispatched to Rahul
    const rahulReminder = dispatched.find(
      (n) => n.type === "EVENT_REMINDER" && n.userId === "user_rahul"
    );
    assert.equal(rahulReminder, undefined, "Rahul must not receive reminder before his 24h window");
  } finally {
    unsubscribe();
  }
});

test("FR-009b: Reminder job ignores cancelled events and cancelled registrations", async () => {
  const db = createMockDb();
  seedData(db);

  const baseTime = new Date("2026-10-28T10:00:00Z");
  const eventTime = new Date(baseTime.getTime() + 10 * 60 * 60 * 1000);

  // Active event with cancelled registration
  db.events.set("evt_reminder_cancelled_reg", {
    id: "evt_reminder_cancelled_reg",
    name: "Webinar",
    date: eventTime,
    time: "08:00 PM",
    venue: "Online",
    category: "Tech",
    capacity: 10,
    status: EventStatus.ACTIVE,
    isCancelled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Amit registers then cancels
  await registerForEvent({ userId: "user_amit", eventId: "evt_reminder_cancelled_reg" }, db);
  await cancelRegistration({ userId: "user_amit", eventId: "evt_reminder_cancelled_reg" }, db);

  // Cancelled event with active registration
  db.events.set("evt_reminder_cancelled_evt", {
    id: "evt_reminder_cancelled_evt",
    name: "Cancelled Seminar",
    date: eventTime,
    time: "08:00 PM",
    venue: "Online",
    category: "Tech",
    capacity: 10,
    status: EventStatus.CANCELLED,
    isCancelled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  db.registrations.set("user_priya_evt_reminder_cancelled_evt", {
    id: "reg_priya_canc_evt",
    userId: "user_priya",
    eventId: "evt_reminder_cancelled_evt",
    status: RegistrationStatus.CONFIRMED,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const dispatched: any[] = [];
  const unsubscribe = onNotification((n) => { dispatched.push(n); });

  try {
    const result = await sendEventReminders(
      { windowHours: 24, referenceDate: baseTime },
      db
    );
    assert.equal(result.remindersSent, 0);
    assert.equal(dispatched.filter((n) => n.type === "EVENT_REMINDER").length, 0);
  } finally {
    unsubscribe();
  }
});

test("FR-009b: Reminder job does not re-send to a registrant already reminded in a prior run", async () => {
  const db = createMockDb();
  seedData(db);

  const baseTime = new Date("2026-10-28T10:00:00Z");
  const eventTime = new Date(baseTime.getTime() + 12 * 60 * 60 * 1000);

  db.events.set("evt_remind_dedupe", {
    id: "evt_remind_dedupe",
    name: "Repeat Reminder Check",
    date: eventTime,
    time: "09:00 PM",
    venue: "Hall B",
    category: "Tech",
    capacity: 10,
    status: EventStatus.ACTIVE,
    isCancelled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await registerForEvent({ userId: "user_amit", eventId: "evt_remind_dedupe" }, db);

  const dispatched: any[] = [];
  const unsubscribe = onNotification((n) => { dispatched.push(n); });

  try {
    // A cron job calling this hourly with a 24h window would otherwise
    // re-send the same reminder on every single invocation.
    const first = await sendEventReminders({ windowHours: 24, referenceDate: baseTime }, db);
    assert.equal(first.remindersSent, 1);

    const second = await sendEventReminders({ windowHours: 24, referenceDate: baseTime }, db);
    assert.equal(second.remindersSent, 0, "a second run within the same window must not re-send");

    assert.equal(dispatched.filter((n) => n.type === "EVENT_REMINDER").length, 1);
  } finally {
    unsubscribe();
  }
});

test("FR-009b: Waitlist cancellation dispatches cancellation confirmation to waitlisted user", async () => {
  const db = createMockDb();
  seedFR008Data(db);

  // Join waitlist for full seminar
  await joinWaitlist({ userId: "user_priya", eventId: "event_full_seminar" }, db);

  const dispatched: any[] = [];
  const unsubscribe = onNotification((n) => {
    dispatched.push(n);
  });

  try {
    const cancelRes = await cancelRegistration(
      { userId: "user_priya", eventId: "event_full_seminar" },
      db
    );
    assert.equal(cancelRes.success, true);
    assert.equal(cancelRes.message, "Waitlist entry cancelled");

    const cancelNotif = dispatched.find(
      (n) => n.type === "CANCELLATION_CONFIRMATION" && n.userId === "user_priya"
    );
    assert.ok(cancelNotif, "Waitlisted user must receive cancellation notification upon leaving waitlist");
    assert.equal(cancelNotif.to, "priya.nair@test.com");
  } finally {
    unsubscribe();
  }
});

test("FR-009b: Self-cancellation is rejected when event is already cancelled", async () => {
  const db = createMockDb();
  seedData(db);

  // event_old_meetup is cancelled in seedData
  const regKey = "user_amit_event_old_meetup";
  db.registrations.set(regKey, {
    id: "reg_amit_old_meetup",
    userId: "user_amit",
    eventId: "event_old_meetup",
    status: RegistrationStatus.CONFIRMED,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const res = await cancelRegistration(
    { userId: "user_amit", eventId: "event_old_meetup" },
    db
  );
  assert.equal(res.success, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.error, CANNOT_CANCEL_CANCELLED_EVENT_ERROR);
});

test("FR-009b: Notification delivery failure does not prevent registration or cancellation (fault tolerance per UC-09)", async () => {
  const db = createMockDb();
  seedData(db);

  // Faulty listener that throws an unhandled error
  const unsubscribe = onNotification(() => {
    throw new Error("Simulated email server crash / connection refused");
  });

  try {
    // Registration succeeds despite notification failure
    const reg = await registerForEvent(
      { userId: "user_amit", eventId: "event_tech_fest" },
      db
    );
    assert.equal(reg.success, true);
    assert.equal(reg.statusCode, 201);
    assert.equal(reg.registration?.status, "confirmed");

    // Cancellation succeeds despite notification failure
    const cancel = await cancelRegistration(
      { userId: "user_amit", eventId: "event_tech_fest" },
      db
    );
    assert.equal(cancel.success, true);
    assert.equal(cancel.statusCode, 200);
    assert.equal(cancel.registration?.status, "cancelled");
  } finally {
    unsubscribe();
  }
});

test("FR-009b: Email templates generate valid HTML and escape dangerous characters", () => {
  // 1. Registration Confirmation Email
  const conf = registrationConfirmationEmail(
    "Priya <script>alert(1)</script>",
    'Tech Fest "2026" & Workshop',
    "2026-11-10",
    "10:00 AM",
    "Main Hall <East>"
  );
  assert.match(conf.subject, /Registration Confirmed: Tech Fest "2026" & Workshop/);
  assert.match(conf.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(conf.html, /Main Hall &lt;East&gt;/);
  assert.ok(!conf.html.includes("<script>"));

  // 2. Cancellation Email
  const canc = registrationCancellationEmail("Amit", "Hackathon", "2026-11-15");
  assert.match(canc.subject, /Registration Cancelled: Hackathon/);
  assert.match(canc.html, /Your registration for <strong>Hackathon<\/strong> has been cancelled/);

  // 3. Reminder Email
  const rem = eventReminderEmail(
    "Rahul",
    "Coding BootCamp",
    new Date("2026-11-20"),
    "09:00 AM",
    "Lab 4"
  );
  assert.match(rem.subject, /Reminder: Coding BootCamp is coming up/);
  assert.match(rem.html, /09:00 AM/);
  assert.match(rem.html, /Lab 4/);
});

test("FR-009b: listRegistrations returns active and waitlisted entries with calculated queue positions and event details", async () => {
  const db = createMockDb();
  seedFR008Data(db);

  // Amit is confirmed on event_full_seminar
  // Priya is waitlist pos 1, Rahul is waitlist pos 2
  await joinWaitlist({ userId: "user_priya", eventId: "event_full_seminar" }, db);
  await joinWaitlist({ userId: "user_rahul", eventId: "event_full_seminar" }, db);

  const priyaList = await listRegistrations({ userId: "user_priya" }, db);
  assert.equal(priyaList.length, 1);
  assert.equal(priyaList[0].userId, "user_priya");
  assert.equal(priyaList[0].status, "waitlisted");
  assert.equal(priyaList[0].waitlistPosition, 1);
  assert.equal(priyaList[0].event?.name, "Full Seminar");

  const rahulList = await listRegistrations({ userId: "user_rahul" }, db);
  assert.equal(rahulList.length, 1);
  assert.equal(rahulList[0].status, "waitlisted");
  assert.equal(rahulList[0].waitlistPosition, 2);
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-010a: Registration counts, seat availability, and participant export
// ─────────────────────────────────────────────────────────────────────────────

test("FR-010a / UT_01: Verify the displayed registered-participant count matches actual active registrations", async () => {
  const db = createMockDb();
  seedData(db);

  // Event: Tech Fest (capacity 100), seed 15 confirmed registrations
  for (let i = 1; i <= 15; i++) {
    const userId = `user_attendee_${i}`;
    db.users.set(userId, {
      id: userId,
      name: `Attendee ${i}`,
      email: `attendee${i}@test.com`,
      role: "PARTICIPANT",
      verified: true,
      suspended: false,
      createdAt: new Date(),
    });
    db.registrations.set(`${userId}_event_tech_fest`, {
      id: `reg_tech_fest_${i}`,
      userId,
      eventId: "event_tech_fest",
      status: RegistrationStatus.CONFIRMED,
      createdAt: new Date(Date.now() + i * 1000),
      updatedAt: new Date(Date.now() + i * 1000),
    });
  }

  // Also seed 2 cancelled registrations to ensure cancelled registrations do NOT count as active
  for (let c = 1; c <= 2; c++) {
    const cancelUserId = `user_cancelled_${c}`;
    db.users.set(cancelUserId, {
      id: cancelUserId,
      name: `Cancelled User ${c}`,
      email: `cancelled${c}@test.com`,
      role: "PARTICIPANT",
      verified: true,
      suspended: false,
      createdAt: new Date(),
    });
    db.registrations.set(`${cancelUserId}_event_tech_fest`, {
      id: `reg_cancelled_${c}`,
      userId: cancelUserId,
      eventId: "event_tech_fest",
      status: RegistrationStatus.CANCELLED,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const capacityInfo = await getEventCapacity("event_tech_fest", db);
  assert.ok(capacityInfo, "capacityInfo should be returned");
  // Expected: Displayed count reads exactly 15, matching the database
  assert.equal(capacityInfo.confirmedCount, 15, "Confirmed active participant count must match live DB (15)");
  assert.equal(capacityInfo.registeredParticipants, 15, "registeredParticipants alias must be 15");
  assert.equal(capacityInfo.activeRegistrations, 15, "activeRegistrations alias must be 15");
});

test("FR-010a / UT_02: Verify the displayed available-seat count equals capacity minus active registrations", async () => {
  const db = createMockDb();
  seedData(db);

  // Event: Tech Fest has capacity: 100. Seed exactly 15 confirmed registrations.
  for (let i = 1; i <= 15; i++) {
    const userId = `user_attendee_${i}`;
    db.users.set(userId, {
      id: userId,
      name: `Attendee ${i}`,
      email: `attendee${i}@test.com`,
      role: "PARTICIPANT",
      verified: true,
      suspended: false,
      createdAt: new Date(),
    });
    db.registrations.set(`${userId}_event_tech_fest`, {
      id: `reg_tech_fest_${i}`,
      userId,
      eventId: "event_tech_fest",
      status: RegistrationStatus.CONFIRMED,
      createdAt: new Date(Date.now() + i * 1000),
      updatedAt: new Date(Date.now() + i * 1000),
    });
  }

  const capacityInfo = await getEventCapacity("event_tech_fest", db);
  assert.ok(capacityInfo);
  assert.equal(capacityInfo.capacity, 100, "Event capacity is 100");
  assert.equal(capacityInfo.confirmedCount, 15, "Active registrations is 15");

  // Expected: Displayed available seats reads exactly 85 (100 - 15 = 85)
  assert.equal(capacityInfo.remainingSeats, 85, "remainingSeats must equal 85");
  assert.equal(capacityInfo.availableSeats, 85, "availableSeats alias must equal 85");
  assert.equal(capacityInfo.isFull, false, "Event is not full");
});

test("FR-010a / IT_01: Verify the exported CSV participant list matches the on-screen registrant list", async () => {
  const db = createMockDb();
  seedData(db);

  // Pre-condition: Organizer owns an event with multiple registrants (15 registrants)
  for (let i = 1; i <= 15; i++) {
    const userId = `user_attendee_${i}`;
    db.users.set(userId, {
      id: userId,
      name: `Attendee ${i}, Jr.`, // test comma escaping in names
      email: `attendee${i}@test.com`,
      role: "PARTICIPANT",
      verified: true,
      suspended: false,
      createdAt: new Date(),
    });
    db.registrations.set(`${userId}_event_tech_fest`, {
      id: `reg_tech_fest_${i}`,
      userId,
      eventId: "event_tech_fest",
      status: RegistrationStatus.CONFIRMED,
      createdAt: new Date("2026-10-02T10:00:00Z"),
      updatedAt: new Date("2026-10-02T10:00:00Z"),
    });
  }

  // 1: Open 'View Registrants' (getEventParticipantReport)
  const report = await getEventParticipantReport("event_tech_fest", db);
  assert.ok(report);
  assert.equal(report.participants.length, 15, "On-screen participant list contains 15 registrants");

  // 2: Click 'Export CSV'
  const csv = exportParticipantsToCSV(report.participants, report.event);
  assert.ok(csv, "CSV output must not be empty");

  // 3: Verify downloaded CSV contents match on-screen list exactly
  const csvLines = csv.trim().split("\r\n");
  assert.equal(csvLines.length, 16, "1 header row + 15 participant rows");

  assert.equal(
    csvLines[0],
    `#,Name,Email,Status,Registration Date,Waitlist Position`,
    "CSV header matches expected schema"
  );

  for (let i = 0; i < 15; i++) {
    const onScreenItem = report.participants[i];
    const row = csvLines[i + 1];

    // Verify row has participant name, email, and CONFIRMED status
    assert.ok(row.includes(`"Attendee ${i + 1}, Jr."`), `Row ${i + 1} has quoted name with comma`);
    assert.ok(row.includes(onScreenItem.email), `Row ${i + 1} contains matching email`);
    assert.ok(row.includes("CONFIRMED"), `Row ${i + 1} contains CONFIRMED status`);
  }
});

test("FR-010a / IT_02: Verify the exported PDF participant list matches the on-screen registrant list", async () => {
  const db = createMockDb();
  seedData(db);

  // Pre-condition: Organizer owns an event with multiple registrants (15 registrants)
  for (let i = 1; i <= 15; i++) {
    const userId = `user_attendee_${i}`;
    db.users.set(userId, {
      id: userId,
      name: `Participant ${i}`,
      email: `participant${i}@test.com`,
      role: "PARTICIPANT",
      verified: true,
      suspended: false,
      createdAt: new Date(),
    });
    db.registrations.set(`${userId}_event_tech_fest`, {
      id: `reg_tech_fest_${i}`,
      userId,
      eventId: "event_tech_fest",
      status: RegistrationStatus.CONFIRMED,
      createdAt: new Date("2026-10-02T10:00:00Z"),
      updatedAt: new Date("2026-10-02T10:00:00Z"),
    });
  }

  // 1: Open 'View Registrants'
  const report = await getEventParticipantReport("event_tech_fest", db);
  assert.ok(report);
  assert.equal(report.participants.length, 15);

  // 2: Click 'Export PDF'
  const pdfBuffer = exportParticipantsToPDF(report.participants, report.event);
  assert.ok(pdfBuffer instanceof Buffer);
  assert.ok(pdfBuffer.length > 500, "PDF buffer must be non-empty");

  const pdfString = pdfBuffer.toString("latin1");
  // Valid PDF header and EOF trailer
  assert.ok(pdfString.startsWith("%PDF-1.4"), "PDF must start with %PDF-1.4 header");
  assert.ok(pdfString.includes("%%EOF"), "PDF must contain %%EOF trailer");
  assert.ok(pdfString.includes("xref"), "PDF must contain xref table");

  // Contains event details and counts matching on-screen list
  assert.ok(pdfString.includes("Tech Fest"), "PDF contains event title");
  assert.ok(pdfString.includes("15 participants"), "PDF contains registered count 15");
  assert.ok(pdfString.includes("85"), "PDF contains available seats 85");

  // Contains all 15 participant names matching on-screen list
  for (let i = 1; i <= 15; i++) {
    assert.ok(
      pdfString.includes(`Participant ${i}`),
      `PDF must include Participant ${i} matching on-screen roster`
    );
  }
});

test("FR-010a / ST_02: Verify an organizer can view accurate event-wise registration info across multiple events", async () => {
  const db = createMockDb();
  seedData(db);

  // Pre-condition: Organizer owns 3 events with differing registration counts (5, 10, and 20)
  const event1 = {
    id: "event_org_1",
    name: "AI Workshop",
    title: "AI Workshop",
    capacity: 50,
    status: EventStatus.ACTIVE,
    isCancelled: false,
    organizerId: "organizer-demo-id",
    date: new Date("2026-11-01"),
  };
  const event2 = {
    id: "event_org_2",
    name: "Web Dev Bootcamp",
    title: "Web Dev Bootcamp",
    capacity: 30,
    status: EventStatus.ACTIVE,
    isCancelled: false,
    organizerId: "organizer-demo-id",
    date: new Date("2026-11-05"),
  };
  const event3 = {
    id: "event_org_3",
    name: "Design Hackathon",
    title: "Design Hackathon",
    capacity: 40,
    status: EventStatus.ACTIVE,
    isCancelled: false,
    organizerId: "organizer-demo-id",
    date: new Date("2026-11-10"),
  };

  db.events.set(event1.id, event1);
  db.events.set(event2.id, event2);
  db.events.set(event3.id, event3);

  // Seed 5 registrants for Event 1
  for (let i = 1; i <= 5; i++) {
    const u = `user_e1_${i}`;
    db.users.set(u, { id: u, name: `E1 User ${i}`, email: `e1_${i}@test.com`, role: "PARTICIPANT" });
    db.registrations.set(`${u}_${event1.id}`, {
      id: `reg_e1_${i}`,
      userId: u,
      eventId: event1.id,
      status: RegistrationStatus.CONFIRMED,
      createdAt: new Date(),
    });
  }

  // Seed 10 registrants for Event 2
  for (let i = 1; i <= 10; i++) {
    const u = `user_e2_${i}`;
    db.users.set(u, { id: u, name: `E2 User ${i}`, email: `e2_${i}@test.com`, role: "PARTICIPANT" });
    db.registrations.set(`${u}_${event2.id}`, {
      id: `reg_e2_${i}`,
      userId: u,
      eventId: event2.id,
      status: RegistrationStatus.CONFIRMED,
      createdAt: new Date(),
    });
  }

  // Seed 20 registrants for Event 3
  for (let i = 1; i <= 20; i++) {
    const u = `user_e3_${i}`;
    db.users.set(u, { id: u, name: `E3 User ${i}`, email: `e3_${i}@test.com`, role: "PARTICIPANT" });
    db.registrations.set(`${u}_${event3.id}`, {
      id: `reg_e3_${i}`,
      userId: u,
      eventId: event3.id,
      status: RegistrationStatus.CONFIRMED,
      createdAt: new Date(),
    });
  }

  // 1 & 2: Open 'My Events' and inspect registration info for each of the 3 events
  const cap1 = await getEventCapacity(event1.id, db);
  const cap2 = await getEventCapacity(event2.id, db);
  const cap3 = await getEventCapacity(event3.id, db);

  // Expected: Each event shows its correct, distinct registration count with no cross-event data mixing
  assert.equal(cap1?.confirmedCount, 5, "Event 1 has exactly 5 confirmed registrations");
  assert.equal(cap1?.remainingSeats, 45, "Event 1 has 45 seats remaining (50 - 5)");

  assert.equal(cap2?.confirmedCount, 10, "Event 2 has exactly 10 confirmed registrations");
  assert.equal(cap2?.remainingSeats, 20, "Event 2 has 20 seats remaining (30 - 10)");

  assert.equal(cap3?.confirmedCount, 20, "Event 3 has exactly 20 confirmed registrations");
  assert.equal(cap3?.remainingSeats, 20, "Event 3 has 20 seats remaining (40 - 20)");
});

test("FR-010a / NFR-001: Performance - Generate CSV and PDF exports of 5,000 registrations within 10 seconds", async () => {
  const largeParticipants: any[] = [];
  for (let i = 1; i <= 5000; i++) {
    largeParticipants.push({
      id: `reg_large_${i}`,
      userId: `user_large_${i}`,
      name: `Participant Number ${i}`,
      email: `participant${i}@biguniversity.edu`,
      status: i <= 4800 ? "confirmed" : i <= 4950 ? "waitlisted" : "cancelled",
      registeredAt: new Date(1760000000000 + i * 1000),
      waitlistPosition: i > 4800 && i <= 4950 ? i - 4800 : null,
    });
  }

  const eventInfo = {
    id: "evt_large_scale",
    name: "National Mega Symposium 2026",
    date: new Date("2026-12-01"),
    time: "09:00 AM - 06:00 PM",
    venue: "Grand Convention Center",
    capacity: 4800,
    confirmedCount: 4800,
    availableSeats: 0,
    waitlistCount: 150,
  };

  // 1. Benchmark CSV Generation (Target: < 10,000 ms)
  const csvStart = performance.now();
  const csv = exportParticipantsToCSV(largeParticipants, eventInfo);
  const csvDuration = performance.now() - csvStart;

  assert.ok(csv.length > 50000, "CSV must contain all 5000 records");
  assert.ok(csvDuration < 10000, `CSV generation took ${csvDuration}ms, must be < 10,000ms`);

  // 2. Benchmark PDF Generation (Target: < 10,000 ms)
  const pdfStart = performance.now();
  const pdfBuffer = exportParticipantsToPDF(largeParticipants, eventInfo);
  const pdfDuration = performance.now() - pdfStart;

  assert.ok(pdfBuffer.length > 100000, "PDF buffer must contain multi-page document");
  assert.ok(pdfDuration < 10000, `PDF generation took ${pdfDuration}ms, must be < 10,000ms`);

  const pdfString = pdfBuffer.toString("latin1");
  assert.ok(pdfString.startsWith("%PDF-1.4"));
  assert.ok(pdfString.includes("%%EOF"));
  assert.ok(pdfString.includes("National Mega Symposium 2026"));
});

test("FR-010a: getEventParticipantReport sorts confirmed first, then waitlist with queue position, then cancelled", async () => {
  const db = createMockDb();
  seedData(db);

  db.users.set("u_conf_1", { id: "u_conf_1", name: "Confirmed One", email: "c1@test.com" });
  db.users.set("u_wait_1", { id: "u_wait_1", name: "Waitlist One", email: "w1@test.com" });
  db.users.set("u_wait_2", { id: "u_wait_2", name: "Waitlist Two", email: "w2@test.com" });
  db.users.set("u_canc_1", { id: "u_canc_1", name: "Cancelled One", email: "x1@test.com" });

  db.registrations.set("u_conf_1_evt", {
    id: "r1",
    userId: "u_conf_1",
    eventId: "event_tech_fest",
    status: RegistrationStatus.CONFIRMED,
    createdAt: new Date("2026-10-01T10:00:00Z"),
  });
  db.registrations.set("u_wait_1_evt", {
    id: "r2",
    userId: "u_wait_1",
    eventId: "event_tech_fest",
    status: RegistrationStatus.WAITLISTED,
    createdAt: new Date("2026-10-01T11:00:00Z"),
  });
  db.registrations.set("u_wait_2_evt", {
    id: "r3",
    userId: "u_wait_2",
    eventId: "event_tech_fest",
    status: RegistrationStatus.WAITLISTED,
    createdAt: new Date("2026-10-01T12:00:00Z"),
  });
  db.registrations.set("u_canc_1_evt", {
    id: "r4",
    userId: "u_canc_1",
    eventId: "event_tech_fest",
    status: RegistrationStatus.CANCELLED,
    createdAt: new Date("2026-10-01T09:00:00Z"),
  });

  const report = await getEventParticipantReport("event_tech_fest", db);
  assert.ok(report);
  assert.equal(report.participants.length, 4);

  // Confirmed comes first
  assert.equal(report.participants[0].userId, "u_conf_1");
  assert.equal(report.participants[0].status, "confirmed");
  assert.equal(report.participants[0].waitlistPosition, null);

  // Then waitlist in chronological order
  assert.equal(report.participants[1].userId, "u_wait_1");
  assert.equal(report.participants[1].status, "waitlisted");
  assert.equal(report.participants[1].waitlistPosition, 1);

  assert.equal(report.participants[2].userId, "u_wait_2");
  assert.equal(report.participants[2].status, "waitlisted");
  assert.equal(report.participants[2].waitlistPosition, 2);

  // Then cancelled
  assert.equal(report.participants[3].userId, "u_canc_1");
  assert.equal(report.participants[3].status, "cancelled");
});

test("FR-010a: Edge Case - Event with 0 registrants exports clean empty roster without errors", async () => {
  const db = createMockDb();
  seedData(db);

  const report = await getEventParticipantReport("event_old_meetup", db);
  assert.ok(report);
  assert.equal(report.participants.length, 0);
  assert.equal(report.confirmedCount, 0);

  const csv = exportParticipantsToCSV(report.participants, report.event);
  assert.ok(csv.includes("#,Name,Email,Status,Registration Date,Waitlist Position"));
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 1, "Only header row present");

  const pdfBuffer = exportParticipantsToPDF(report.participants, report.event);
  assert.ok(pdfBuffer instanceof Buffer);
  const pdfString = pdfBuffer.toString("latin1");
  assert.ok(pdfString.startsWith("%PDF-1.4"));
  assert.ok(pdfString.includes("No participants registered"));
});

test("FR-010a: CSV export neutralizes formula-injection payloads in participant-controlled fields", async () => {
  const participants: any[] = [
    {
      id: "reg_inj_1",
      userId: "user_inj_1",
      name: '=HYPERLINK("http://evil.example","click me")',
      email: "attacker@test.com",
      status: "confirmed",
      registeredAt: new Date("2026-10-02T10:00:00Z"),
      waitlistPosition: null,
    },
    {
      id: "reg_inj_2",
      userId: "user_inj_2",
      name: "+1+1",
      email: "-2+3",
      status: "confirmed",
      registeredAt: new Date("2026-10-02T10:00:00Z"),
      waitlistPosition: null,
    },
  ];

  const csv = exportParticipantsToCSV(participants, { name: "Injection Test Event" } as any);
  const lines = csv.trim().split("\r\n");

  // A spreadsheet only treats a cell as a formula when the FIRST character
  // (after unwrapping quotes) is =, +, -, or @ — the leading single quote
  // this fix inserts must survive the CSV quoting so that character is
  // never first in the field.
  assert.ok(lines[1].includes('"\'=HYPERLINK'), "leading = must be neutralized with a leading quote");
  assert.ok(lines[2].includes("'+1+1"), "leading + must be neutralized");
  assert.ok(lines[2].includes("'-2+3"), "leading - in email field must be neutralized");
});

test("FR-010a: PDF export renders accented Latin-1 names instead of replacing them with '?'", async () => {
  const participants: any[] = [
    {
      id: "reg_unicode_1",
      userId: "user_unicode_1",
      name: "José Zoë Müller",
      email: "jose@test.com",
      status: "confirmed",
      registeredAt: new Date("2026-10-02T10:00:00Z"),
      waitlistPosition: null,
    },
  ];

  const pdfBuffer = exportParticipantsToPDF(participants, { name: "Unicode Test Event" } as any);
  const pdfString = pdfBuffer.toString("latin1");

  assert.ok(pdfString.startsWith("%PDF-1.4"));
  // The accented characters must appear as themselves (latin1 byte, per
  // the declared /Encoding /WinAnsiEncoding), not collapsed to "?".
  assert.ok(pdfString.includes("Jos\xe9"), "é must render, not fall back to '?'");
  assert.ok(pdfString.includes("Zo\xeb"), "ë must render, not fall back to '?'");
  assert.ok(pdfString.includes("M\xfcller"), "ü must render, not fall back to '?'");
  assert.ok(pdfString.includes("/Encoding /WinAnsiEncoding"), "fonts must declare WinAnsiEncoding");
});
