import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { RegistrationStatus, EventStatus } from "@prisma/client";
import { sendEventReminders } from "../lib/registration";

process.env.SESSION_SECRET ||= "test-only-session-secret";

describe("lib/registration.ts: sendEventReminders fallback db shapes", () => {
  test("falls back to Map scans for events, registrations and users when no Prisma-like namespaces exist", async () => {
    const baseTime = new Date("2026-11-10T10:00:00Z");
    const eventTime = new Date(baseTime.getTime() + 10 * 60 * 60 * 1000);
    const db: any = {
      events: new Map([
        [
          "evt_1",
          {
            id: "evt_1",
            name: "Hack Night",
            date: eventTime,
            time: "6 PM",
            venue: "Hall",
            status: EventStatus.ACTIVE,
            isCancelled: false,
          },
        ],
      ]),
      registrations: new Map([
        [
          "u1_evt_1",
          { id: "r1", userId: "u1", eventId: "evt_1", status: RegistrationStatus.CONFIRMED, createdAt: new Date() },
        ],
      ]),
      users: new Map([["u1", { id: "u1", name: "Ann", email: "ann@example.com" }]]),
    };

    const result = await sendEventReminders({ windowHours: 24, referenceDate: baseTime }, db);
    assert.equal(result.success, true);
    assert.equal(result.eventsProcessed, 1);
    assert.equal(result.remindersSent, 1);
    assert.equal(result.notifications[0].email, "ann@example.com");
  });

  test("falls back to a manual filter when the first db.event.findMany call throws, and logs when marking a reminder sent fails", async () => {
    const baseTime = new Date("2026-11-10T10:00:00Z");
    const eventTime = new Date(baseTime.getTime() + 10 * 60 * 60 * 1000);
    let findManyCalls = 0;

    const db: any = {
      event: {
        findMany: async () => {
          findManyCalls++;
          if (findManyCalls === 1) {
            throw new Error("this mock doesn't support the include-shaped query");
          }
          return [
            {
              id: "evt_2",
              name: "Plain Event",
              date: eventTime,
              status: EventStatus.ACTIVE,
              isCancelled: false,
            },
          ];
        },
      },
      registration: {
        findMany: async () => [
          {
            id: "r2",
            userId: "u2",
            eventId: "evt_2",
            status: RegistrationStatus.CONFIRMED,
            createdAt: new Date(),
            user: { id: "u2", name: "Bob", email: "bob@example.com" },
          },
        ],
        update: async () => {
          throw new Error("Simulated failure marking reminder as sent");
        },
      },
    };

    const result = await sendEventReminders({ windowHours: 24, referenceDate: baseTime }, db);
    assert.equal(findManyCalls, 2);
    assert.equal(result.remindersSent, 1);
    assert.equal(result.notifications[0].email, "bob@example.com");
  });
});
