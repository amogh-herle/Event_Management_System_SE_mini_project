import test from "node:test";
import assert from "node:assert/strict";
import { Prisma, RegistrationStatus, EventStatus } from "@prisma/client";
import {
  registerForEvent,
  checkUserRegistration,
  DUPLICATE_REGISTRATION_ERROR,
  EVENT_CANCELLED_ERROR,
  EVENT_NOT_FOUND_ERROR,
  USER_NOT_FOUND_ERROR,
  USER_SUSPENDED_ERROR,
  AUTH_REQUIRED_ERROR,
} from "../lib/registration";

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
          id: `reg_cuid_${regIdCounter++}`,
          userId: data.userId,
          eventId: data.eventId,
          status: data.status || RegistrationStatus.CONFIRMED,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...(include?.user ? { user: { id: user.id, name: user.name, email: user.email } } : {}),
          ...(include?.event ? { event: { id: event.id, name: event.name || event.title, date: event.date, status: event.status || (event.isCancelled ? EventStatus.CANCELLED : EventStatus.ACTIVE) } } : {}),
        };

        registrations.set(key, record);
        return record;
      },

      async update({ where, data, include }: any) {
        for (const [key, record] of registrations.entries()) {
          if (record.id === where.id) {
            const updated = {
              ...record,
              ...data,
              updatedAt: new Date(),
            };
            if (include?.user) {
              const u = users.get(updated.userId);
              updated.user = { id: u.id, name: u.name, email: u.email };
            }
            if (include?.event) {
              const e = events.get(updated.eventId);
              updated.event = { id: e.id, name: e.name || e.title, date: e.date, status: e.status || (e.isCancelled ? EventStatus.CANCELLED : EventStatus.ACTIVE) };
            }
            registrations.set(key, updated);
            return updated;
          }
        }
        throw new Error("Record to update not found");
      },

      async findMany({ where }: any = {}) {
        const list = Array.from(registrations.values());
        return list.filter((r) => {
          if (where?.userId && r.userId !== where.userId) return false;
          if (where?.eventId && r.eventId !== where.eventId) return false;
          return true;
        });
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

// -----------------------------------------------------------------------------
// Test Suites
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
