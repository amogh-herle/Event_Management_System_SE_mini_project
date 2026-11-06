import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";

process.env.SESSION_SECRET ||= "test-only-session-secret";

// Patch the shared jsonTransport before any lazy getTransporter() call inside
// lib/mailer.ts runs, so sendMail() failures can be simulated without ever
// touching the network. registration.ts's module body only *defines*
// functions at import time, so this patch is in place well before any test
// below actually triggers a send.
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

import {
  sendWaitlistPromotionNotification,
  sendRegistrationNotification,
  sendCancellationNotification,
  sendEventReminderNotification,
  onNotification,
  onWaitlistNotification,
  clearNotificationListeners,
} from "../lib/registration";

afterEach(() => {
  shouldFailSend = false;
  clearNotificationListeners();
});

describe("lib/registration.ts: notification db-lookup fallbacks", () => {
  test("sendWaitlistPromotionNotification looks up user/event via a Prisma-like db when not inlined", async () => {
    const db: any = {
      user: { findUnique: async () => ({ email: "ann@example.com", name: "Ann" }) },
      event: { findUnique: async () => ({ name: "Hack Night", date: "2026-01-15" }) },
    };
    const result = await sendWaitlistPromotionNotification({ userId: "u1", eventId: "e1" }, db);
    assert.equal(result, true);
  });

  test("sendWaitlistPromotionNotification looks up user/event via Map-based test db when not inlined", async () => {
    const db: any = {
      users: new Map([["u1", { email: "ben@example.com", name: "Ben" }]]),
      events: new Map([["e1", { name: "Hack Night", date: "2026-01-15" }]]),
    };
    const result = await sendWaitlistPromotionNotification({ userId: "u1", eventId: "e1" }, db);
    assert.equal(result, true);
  });

  test("sendRegistrationNotification looks up user/event via a Prisma-like db when not inlined", async () => {
    const db: any = {
      user: { findUnique: async () => ({ email: "cara@example.com", name: "Cara" }) },
      event: { findUnique: async () => ({ name: "Hack Night", date: "2026-01-15", time: "6 PM", venue: "Hall" }) },
    };
    const result = await sendRegistrationNotification({ userId: "u1", eventId: "e1" }, db);
    assert.equal(result, true);
  });

  test("sendRegistrationNotification looks up user/event via Map-based test db when not inlined", async () => {
    const db: any = {
      users: new Map([["u1", { email: "dani@example.com", name: "Dani" }]]),
      events: new Map([["e1", { name: "Hack Night", date: "2026-01-15", time: "6 PM", venue: "Hall" }]]),
    };
    const result = await sendRegistrationNotification({ userId: "u1", eventId: "e1" }, db);
    assert.equal(result, true);
  });

  test("sendCancellationNotification looks up user/event via a Prisma-like db when not inlined", async () => {
    const db: any = {
      user: { findUnique: async () => ({ email: "eve@example.com", name: "Eve" }) },
      event: { findUnique: async () => ({ name: "Hack Night", date: "2026-01-15" }) },
    };
    const result = await sendCancellationNotification({ userId: "u1", eventId: "e1" }, db);
    assert.equal(result, true);
  });

  test("sendCancellationNotification looks up user/event via Map-based test db when not inlined", async () => {
    const db: any = {
      users: new Map([["u1", { email: "finn@example.com", name: "Finn" }]]),
      events: new Map([["e1", { name: "Hack Night", date: "2026-01-15" }]]),
    };
    const result = await sendCancellationNotification({ userId: "u1", eventId: "e1" }, db);
    assert.equal(result, true);
  });

  test("sendEventReminderNotification looks up user via a Prisma-like db when not inlined", async () => {
    const db: any = {
      user: { findUnique: async () => ({ email: "gabe@example.com", name: "Gabe" }) },
    };
    const result = await sendEventReminderNotification(
      { userId: "u1", eventId: "e1", event: { name: "Hack Night", date: "2026-01-15" } },
      db
    );
    assert.equal(result, true);
  });

  test("sendEventReminderNotification looks up user via Map-based test db when not inlined", async () => {
    const db: any = {
      users: new Map([["u1", { email: "holly@example.com", name: "Holly" }]]),
    };
    const result = await sendEventReminderNotification(
      { userId: "u1", eventId: "e1", event: { name: "Hack Night", date: "2026-01-15" } },
      db
    );
    assert.equal(result, true);
  });
});

describe("lib/registration.ts: notification no-email / listener-error / send-failure branches", () => {
  test("each notification function returns false and skips sending when the user has no email", async () => {
    assert.equal(
      await sendWaitlistPromotionNotification({ userId: "u1", eventId: "e1", user: { email: "", name: "X" } }),
      false
    );
    assert.equal(
      await sendRegistrationNotification({ userId: "u1", eventId: "e1", user: { email: "", name: "X" } }),
      false
    );
    assert.equal(
      await sendCancellationNotification({ userId: "u1", eventId: "e1", user: { email: "", name: "X" } }),
      false
    );
    assert.equal(
      await sendEventReminderNotification({
        userId: "u1",
        eventId: "e1",
        user: { email: "", name: "X" },
        event: { name: "Hack Night", date: "2026-01-15" },
      }),
      false
    );
  });

  test("a throwing general listener does not stop sendWaitlistPromotionNotification from sending", async () => {
    const unsubscribe = onNotification(() => {
      throw new Error("Simulated listener crash");
    });
    try {
      const result = await sendWaitlistPromotionNotification({
        userId: "u1",
        eventId: "e1",
        user: { email: "ivy@example.com", name: "Ivy" },
        event: { name: "Hack Night", date: "2026-01-15" },
      });
      assert.equal(result, true);
    } finally {
      unsubscribe();
    }
  });

  test("a throwing waitlist-specific listener does not stop sendWaitlistPromotionNotification from sending", async () => {
    const unsubscribe = onWaitlistNotification(() => {
      throw new Error("Simulated waitlist listener crash");
    });
    try {
      const result = await sendWaitlistPromotionNotification({
        userId: "u1",
        eventId: "e1",
        user: { email: "jack@example.com", name: "Jack" },
        event: { name: "Hack Night", date: "2026-01-15" },
      });
      assert.equal(result, true);
    } finally {
      unsubscribe();
    }
  });

  test("a throwing listener does not stop sendRegistrationNotification/sendCancellationNotification/sendEventReminderNotification from sending", async () => {
    const unsubscribe = onNotification(() => {
      throw new Error("Simulated listener crash");
    });
    try {
      assert.equal(
        await sendRegistrationNotification({
          userId: "u1",
          eventId: "e1",
          user: { email: "kai@example.com", name: "Kai" },
          event: { name: "Hack Night", date: "2026-01-15" },
        }),
        true
      );
      assert.equal(
        await sendCancellationNotification({
          userId: "u1",
          eventId: "e1",
          user: { email: "liam@example.com", name: "Liam" },
          event: { name: "Hack Night", date: "2026-01-15" },
        }),
        true
      );
      assert.equal(
        await sendEventReminderNotification({
          userId: "u1",
          eventId: "e1",
          user: { email: "mia@example.com", name: "Mia" },
          event: { name: "Hack Night", date: "2026-01-15" },
        }),
        true
      );
    } finally {
      unsubscribe();
    }
  });

  test("each notification function returns false and logs when the email provider fails", async () => {
    shouldFailSend = true;
    assert.equal(
      await sendWaitlistPromotionNotification({
        userId: "u1",
        eventId: "e1",
        user: { email: "noah@example.com", name: "Noah" },
        event: { name: "Hack Night", date: "2026-01-15" },
      }),
      false
    );
    assert.equal(
      await sendRegistrationNotification({
        userId: "u1",
        eventId: "e1",
        user: { email: "olive@example.com", name: "Olive" },
        event: { name: "Hack Night", date: "2026-01-15" },
      }),
      false
    );
    assert.equal(
      await sendCancellationNotification({
        userId: "u1",
        eventId: "e1",
        user: { email: "piper@example.com", name: "Piper" },
        event: { name: "Hack Night", date: "2026-01-15" },
      }),
      false
    );
    assert.equal(
      await sendEventReminderNotification({
        userId: "u1",
        eventId: "e1",
        user: { email: "quinn@example.com", name: "Quinn" },
        event: { name: "Hack Night", date: "2026-01-15" },
      }),
      false
    );
  });
});
