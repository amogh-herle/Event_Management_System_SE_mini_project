import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { Prisma, RegistrationStatus, EventStatus } from "@prisma/client";

process.env.SESSION_SECRET ||= "test-only-session-secret";

// Patched before any lazy getTransporter() call inside lib/mailer.ts runs
// (registration.ts only *defines* functions at import time), so sendMail
// failures can be simulated without a real network call.
let shouldFailSend = false;
const originalCreateTransport = nodemailer.createTransport;
(nodemailer as any).createTransport = (options: any) => {
  if (options && options.jsonTransport) {
    return {
      sendMail: async (msg: any) => {
        if (shouldFailSend) throw new Error("Simulated email provider outage");
        return { response: JSON.stringify(msg) };
      },
    };
  }
  return originalCreateTransport(options);
};

import { registerForEvent, clearEventLocks, ALREADY_WAITLISTED_ERROR, DUPLICATE_REGISTRATION_ERROR } from "../lib/registration";

afterEach(() => {
  shouldFailSend = false;
  clearEventLocks();
});

type Row = Record<string, any>;

function createMinimalDb() {
  const users = new Map<string, Row>();
  const events = new Map<string, Row>();
  const registrations = new Map<string, Row>();
  let counter = 1;

  return {
    users,
    events,
    registrations,
    user: {
      async findUnique({ where }: any) {
        if (where.id) return users.get(where.id) ?? null;
        for (const u of users.values()) if (u.email === where.email) return u;
        return null;
      },
    },
    event: {
      async findUnique({ where }: any) {
        return events.get(where.id) ?? null;
      },
    },
    registration: {
      async findUnique({ where }: any) {
        const key = `${where.userId_eventId.userId}_${where.userId_eventId.eventId}`;
        const r = registrations.get(key);
        if (!r) return null;
        return { ...r, user: users.get(r.userId) ?? null, event: events.get(r.eventId) ?? null };
      },
      async findMany({ where }: any = {}) {
        return Array.from(registrations.values()).filter(
          (r) => (!where?.eventId || r.eventId === where.eventId) && (!where?.status || r.status === where.status)
        );
      },
      async create({ data, include }: any) {
        const row = { id: `reg_${counter++}`, ...data };
        registrations.set(`${row.userId}_${row.eventId}`, row);
        return {
          ...row,
          ...(include?.user ? { user: users.get(row.userId) ?? null } : {}),
          ...(include?.event ? { event: events.get(row.eventId) ?? null } : {}),
        };
      },
      async update({ where, data, include }: any) {
        let found: Row | undefined;
        let key: string | undefined;
        for (const [k, r] of registrations.entries()) {
          if (r.id === where.id) {
            found = r;
            key = k;
            break;
          }
        }
        if (!found || !key) throw new Error("registration not found");
        const updated = { ...found, ...data };
        registrations.set(key, updated);
        return {
          ...updated,
          ...(include?.user ? { user: users.get(updated.userId) ?? null } : {}),
          ...(include?.event ? { event: events.get(updated.eventId) ?? null } : {}),
        };
      },
    },
  };
}

function seedUserAndFullEvent(db: ReturnType<typeof createMinimalDb>) {
  db.users.set("u1", { id: "u1", name: "Ann", email: "ann@example.com", suspended: false });
  db.users.set("u2", { id: "u2", name: "Bob", email: "bob@example.com", suspended: false });
  db.events.set("evt_full", {
    id: "evt_full",
    name: "Full Event",
    date: new Date("2026-12-01T10:00:00Z"),
    status: EventStatus.ACTIVE,
    capacity: 1,
  });
  db.registrations.set("u2_evt_full", {
    id: "reg_seed",
    userId: "u2",
    eventId: "evt_full",
    status: RegistrationStatus.CONFIRMED,
    createdAt: new Date("2026-11-01T00:00:00Z"),
  });
}

describe("lib/registration.ts: registerForEvent edge cases", () => {
  test("re-registering while already waitlisted returns ALREADY_WAITLISTED_ERROR with a queue position", async () => {
    const db = createMinimalDb();
    seedUserAndFullEvent(db);
    db.registrations.set("u1_evt_full", {
      id: "reg_waitlisted",
      userId: "u1",
      eventId: "evt_full",
      status: RegistrationStatus.WAITLISTED,
      createdAt: new Date("2026-11-05T00:00:00Z"),
    });

    const result = await registerForEvent({ userId: "u1", eventId: "evt_full" }, db as any);
    assert.equal(result.success, false);
    assert.equal(result.statusCode, 409);
    assert.equal(result.error, ALREADY_WAITLISTED_ERROR);
    assert.equal(result.waitlistPosition, 1);
  });

  test("falls back to findMany for the capacity check when registration.count is unavailable", async () => {
    const db = createMinimalDb();
    seedUserAndFullEvent(db);
    delete (db.registration as any).count;

    const result = await registerForEvent({ userId: "u1", eventId: "evt_full" }, db as any);
    assert.equal(result.success, false);
    assert.equal(result.error, "Event is full");
  });

  test("reactivates a previously-cancelled registration into WAITLISTED when rejoining a full event with waitlist: true", async () => {
    const db = createMinimalDb();
    seedUserAndFullEvent(db);
    db.registrations.set("u1_evt_full", {
      id: "reg_cancelled",
      userId: "u1",
      eventId: "evt_full",
      status: RegistrationStatus.CANCELLED,
      createdAt: new Date("2026-11-02T00:00:00Z"),
    });

    const result = await registerForEvent({ userId: "u1", eventId: "evt_full", waitlist: true }, db as any);
    assert.equal(result.success, true);
    assert.equal(result.registration?.id, "reg_cancelled");
    assert.equal(result.registration?.rawStatus, RegistrationStatus.WAITLISTED);
    assert.equal(result.waitlistPosition, 1);
  });

  test("returns a duplicate-registration conflict when the waitlist-join create hits a unique-constraint race", async () => {
    const db = createMinimalDb();
    seedUserAndFullEvent(db);
    const originalCreate = db.registration.create.bind(db.registration);
    db.registration.create = (async () => {
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      });
    }) as any;

    const result = await registerForEvent({ userId: "u1", eventId: "evt_full", waitlist: true }, db as any);
    assert.equal(result.success, false);
    assert.equal(result.statusCode, 409);
    assert.equal(result.error, DUPLICATE_REGISTRATION_ERROR);
    void originalCreate;
  });

  test("also recognizes a non-Prisma error carrying a P2002 code as a duplicate-registration race on the waitlist-join path", async () => {
    const db = createMinimalDb();
    seedUserAndFullEvent(db);
    db.registration.create = (async () => {
      throw Object.assign(new Error("some driver-level error"), { code: "P2002" });
    }) as any;

    const result = await registerForEvent({ userId: "u1", eventId: "evt_full", waitlist: true }, db as any);
    assert.equal(result.success, false);
    assert.equal(result.error, DUPLICATE_REGISTRATION_ERROR);
  });

  test("also recognizes a plain unique-constraint message as a duplicate-registration race on the waitlist-join path", async () => {
    const db = createMinimalDb();
    seedUserAndFullEvent(db);
    db.registration.create = (async () => {
      throw new Error("Unique constraint failed on the fields: (`userId`,`eventId`)");
    }) as any;

    const result = await registerForEvent({ userId: "u1", eventId: "evt_full", waitlist: true }, db as any);
    assert.equal(result.success, false);
    assert.equal(result.error, DUPLICATE_REGISTRATION_ERROR);
  });

  test("rethrows an unexpected error from the waitlist-join create", async () => {
    const db = createMinimalDb();
    seedUserAndFullEvent(db);
    db.registration.create = (async () => {
      throw new Error("Simulated database connection loss during waitlist join");
    }) as any;

    await assert.rejects(
      () => registerForEvent({ userId: "u1", eventId: "evt_full", waitlist: true }, db as any),
      /Simulated database connection loss during waitlist join/
    );
  });

  test("returns a duplicate-registration conflict when the confirmed-registration create hits a unique-constraint race", async () => {
    const db = createMinimalDb();
    db.users.set("u1", { id: "u1", name: "Ann", email: "ann@example.com", suspended: false });
    db.events.set("evt_open", {
      id: "evt_open",
      name: "Open Event",
      date: new Date("2026-12-01T10:00:00Z"),
      status: EventStatus.ACTIVE,
      capacity: 10,
    });
    db.registration.create = (async () => {
      throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "P2002" });
    }) as any;

    const result = await registerForEvent({ userId: "u1", eventId: "evt_open" }, db as any);
    assert.equal(result.success, false);
    assert.equal(result.statusCode, 409);
    assert.equal(result.error, DUPLICATE_REGISTRATION_ERROR);
  });

  test("rethrows an unexpected error from the confirmed-registration create", async () => {
    const db = createMinimalDb();
    db.users.set("u1", { id: "u1", name: "Ann", email: "ann@example.com", suspended: false });
    db.events.set("evt_open", {
      id: "evt_open",
      name: "Open Event",
      date: new Date("2026-12-01T10:00:00Z"),
      status: EventStatus.ACTIVE,
      capacity: 10,
    });
    db.registration.create = (async () => {
      throw new Error("Simulated database connection loss");
    }) as any;

    await assert.rejects(
      () => registerForEvent({ userId: "u1", eventId: "evt_open" }, db as any),
      /Simulated database connection loss/
    );
  });

  test("logs but does not fail the registration when the post-commit notification dispatch throws", async () => {
    const db = createMinimalDb();
    db.users.set("u1", { id: "u1", name: "Ann", email: "ann@example.com", suspended: false });
    db.events.set("evt_open", {
      id: "evt_open",
      name: "Open Event",
      date: new Date("2026-12-01T10:00:00Z"),
      status: EventStatus.ACTIVE,
      capacity: 10,
    });
    shouldFailSend = true;

    const result = await registerForEvent({ userId: "u1", eventId: "evt_open" }, db as any);
    assert.equal(result.success, true);
  });

  test("logs but does not fail the registration when the notification dispatch itself throws (not just the email send)", async () => {
    const db = createMinimalDb();
    db.users.set("u1", { id: "u1", name: "Ann", email: "ann@example.com", suspended: false });
    db.events.set("evt_open2", {
      id: "evt_open2",
      name: "Open Event",
      date: new Date("2026-12-01T10:00:00Z"),
      status: EventStatus.ACTIVE,
      capacity: 10,
    });

    // Simulate the registration.create's `include: { user: ... }` missing
    // the relation (so sendRegistrationNotification falls back to a fresh
    // db.user.findUnique lookup), combined with that fallback lookup itself
    // failing — exercising registerForEvent's own post-commit catch, not
    // sendRegistrationNotification's internal email-send catch.
    const realCreate = db.registration.create.bind(db.registration);
    db.registration.create = (async (args: any) => {
      const saved = await realCreate(args);
      return { ...saved, user: undefined };
    }) as any;
    let userLookups = 0;
    const realFindUnique = db.user.findUnique.bind(db.user);
    db.user.findUnique = (async (args: any) => {
      userLookups++;
      if (userLookups === 1) return realFindUnique(args);
      throw new Error("Simulated user lookup failure during notification dispatch");
    }) as any;

    const result = await registerForEvent({ userId: "u1", eventId: "evt_open2" }, db as any);
    assert.equal(result.success, true);
  });
});
