import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { RegistrationStatus, EventStatus } from "@prisma/client";
import {
  getWaitlistCount,
  getWaitlistPosition,
  getEventCapacity,
  getEventParticipantReport,
  listRegistrations,
} from "../lib/registration";

process.env.SESSION_SECRET ||= "test-only-session-secret";

describe("lib/registration.ts: fallback db shapes not exercised by the Map-based mock", () => {
  test("getWaitlistCount falls back to findMany when db.registration.count is unavailable", async () => {
    const db: any = {
      registration: {
        findMany: async () => [
          { status: RegistrationStatus.WAITLISTED },
          { status: "WAITLISTED" },
          { status: RegistrationStatus.CONFIRMED },
        ],
      },
    };
    const count = await getWaitlistCount("evt_1", db);
    assert.equal(count, 2);
  });

  test("getWaitlistCount returns 0 when neither count nor findMany is available", async () => {
    const db: any = { registration: {} };
    assert.equal(await getWaitlistCount("evt_1", db), 0);
  });

  test("getEventCapacity falls back to findMany for confirmedCount when count is unavailable", async () => {
    const db: any = {
      event: { findUnique: async () => ({ id: "evt_1", capacity: 10, status: EventStatus.ACTIVE }) },
      registration: {
        findMany: async ({ where }: any) =>
          where.status === RegistrationStatus.CONFIRMED
            ? [{ status: "CONFIRMED" }, { status: RegistrationStatus.CONFIRMED }]
            : [],
      },
    };
    const cap = await getEventCapacity("evt_1", db);
    assert.ok(cap);
    assert.equal(cap!.confirmedCount, 2);
    assert.equal(cap!.waitlistCount, 0);
    assert.equal(cap!.remainingSeats, 8);
  });

  test("getEventCapacity falls back to a Map scan for confirmedCount when no registration namespace exists", async () => {
    const db: any = {
      event: { findUnique: async () => ({ id: "evt_1", capacity: 5, status: EventStatus.ACTIVE }) },
      registrations: new Map([
        ["u1_evt_1", { eventId: "evt_1", status: RegistrationStatus.CONFIRMED }],
        ["u2_evt_1", { eventId: "evt_1", status: "CONFIRMED" }],
        ["u3_evt_1", { eventId: "evt_1", status: RegistrationStatus.CANCELLED }],
        ["u4_evt_2", { eventId: "evt_2", status: RegistrationStatus.CONFIRMED }],
      ]),
    };
    const cap = await getEventCapacity("evt_1", db);
    assert.ok(cap);
    assert.equal(cap!.confirmedCount, 2);
    assert.equal(cap!.remainingSeats, 3);
  });

  test("getWaitlistPosition returns null when there is no registration at all", async () => {
    const db: any = { registration: { findUnique: async () => null } };
    assert.equal(await getWaitlistPosition("u1", "evt_1", db), null);
  });

  test("getWaitlistPosition returns null when the registration is not waitlisted", async () => {
    const db: any = {
      registration: { findUnique: async () => ({ status: RegistrationStatus.CONFIRMED, createdAt: new Date() }) },
    };
    assert.equal(await getWaitlistPosition("u1", "evt_1", db), null);
  });

  test("getWaitlistPosition falls back to a count-based estimate when findMany is unavailable", async () => {
    const db: any = {
      registration: {
        findUnique: async () => ({ status: RegistrationStatus.WAITLISTED, createdAt: new Date() }),
        count: async () => 3,
      },
    };
    assert.equal(await getWaitlistPosition("u1", "evt_1", db), 3);
  });

  test("getEventParticipantReport falls back to Map scans for registrations and user lookups", async () => {
    const db: any = {
      event: {
        findUnique: async () => ({ id: "evt_1", name: "Hack Night", capacity: 10, status: EventStatus.ACTIVE }),
      },
      registration: {
        count: async ({ where }: any) => (where.status === RegistrationStatus.CONFIRMED ? 1 : 0),
      },
      registrations: new Map([
        ["u1_evt_1", { id: "r1", userId: "u1", eventId: "evt_1", status: "CONFIRMED", createdAt: new Date() }],
      ]),
      users: new Map([["u1", { id: "u1", name: "Ann", email: "ann@example.com" }]]),
    };
    const report = await getEventParticipantReport("evt_1", db);
    assert.ok(report);
    assert.equal(report!.participants.length, 1);
    assert.equal(report!.participants[0].name, "Ann");
    assert.equal(report!.participants[0].email, "ann@example.com");
  });

  test("listRegistrations falls back to a Map scan when db.registration.findMany is unavailable", async () => {
    const db: any = {
      registrations: new Map([
        ["u1_evt_1", { id: "r1", userId: "u1", eventId: "evt_1", status: "CONFIRMED", createdAt: new Date() }],
        ["u2_evt_2", { id: "r2", userId: "u2", eventId: "evt_2", status: "CONFIRMED", createdAt: new Date() }],
      ]),
    };
    const results = await listRegistrations({ userId: "u1" }, db);
    assert.equal(results.length, 1);
    assert.equal(results[0].userId, "u1");
  });

  test("listRegistrations logs and continues when computing a waitlist position throws", async () => {
    const db: any = { registration: {} };
    // listRegistrations' own findMany call succeeds once; calculateWaitlistPosition's
    // subsequent findMany call (to compute the queue position) then throws.
    let call = 0;
    db.registration.findMany = async () => {
      call++;
      if (call === 1) {
        return [
          { id: "r1", userId: "u1", eventId: "evt_1", status: RegistrationStatus.WAITLISTED, createdAt: new Date() },
        ];
      }
      throw new Error("Simulated query failure while computing waitlist position");
    };
    const results = await listRegistrations({ eventId: "evt_1" }, db);
    assert.equal(results.length, 1);
    assert.equal(results[0].waitlistPosition, undefined);
  });
});
