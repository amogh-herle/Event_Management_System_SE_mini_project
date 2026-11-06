import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createEventSchema, registerEventSchema } from "../lib/validation";

const validEventInput = {
  name: "Hack Night",
  description: "A night of hacking.",
  date: "2026-01-15",
  time: "18:00",
  venue: "Main Hall",
  category: "Tech",
};

describe("lib/validation.ts: createEventSchema capacity rules", () => {
  test("rejects a missing capacity", () => {
    const result = createEventSchema.safeParse({ ...validEventInput });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.match(result.error.issues[0].message, /Required field missing: capacity/);
    }
  });

  test("rejects an empty-string capacity the same as missing", () => {
    const result = createEventSchema.safeParse({ ...validEventInput, capacity: "" });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.match(result.error.issues[0].message, /Required field missing: capacity/);
    }
  });

  test("rejects a non-numeric capacity", () => {
    const result = createEventSchema.safeParse({ ...validEventInput, capacity: "abc" });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.match(result.error.issues[0].message, /Invalid capacity: capacity must be a positive integer/);
    }
  });

  test("rejects a non-integer capacity", () => {
    const result = createEventSchema.safeParse({ ...validEventInput, capacity: 10.5 });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.match(result.error.issues[0].message, /Invalid capacity: capacity must be a positive integer/);
    }
  });

  test("rejects a zero or negative capacity", () => {
    const zero = createEventSchema.safeParse({ ...validEventInput, capacity: 0 });
    const negative = createEventSchema.safeParse({ ...validEventInput, capacity: -5 });
    assert.equal(zero.success, false);
    assert.equal(negative.success, false);
  });

  test("rejects a capacity above the 100,000 Postgres-int-safe bound", () => {
    const result = createEventSchema.safeParse({ ...validEventInput, capacity: 100_001 });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.match(result.error.issues[0].message, /must be 100,000 or less/);
    }
  });

  test("accepts capacity exactly at the 100,000 bound", () => {
    const result = createEventSchema.safeParse({ ...validEventInput, capacity: 100_000 });
    assert.equal(result.success, true);
  });

  test("accepts a valid numeric-string capacity and transforms it to a number", () => {
    const result = createEventSchema.safeParse({ ...validEventInput, capacity: "50" });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.capacity, 50);
      assert.equal(typeof result.data.capacity, "number");
    }
  });

  test("rejects a date that doesn't parse", () => {
    const result = createEventSchema.safeParse({ ...validEventInput, capacity: 10, date: "not-a-date" });
    assert.equal(result.success, false);
  });
});

describe("lib/validation.ts: registerEventSchema", () => {
  test("accepts a bare eventId with waitlist omitted", () => {
    const result = registerEventSchema.safeParse({ eventId: "evt_1" });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.waitlist, undefined);
    }
  });

  test("accepts an explicit waitlist flag", () => {
    const withWaitlist = registerEventSchema.safeParse({ eventId: "evt_1", waitlist: true });
    assert.equal(withWaitlist.success, true);
    if (withWaitlist.success) assert.equal(withWaitlist.data.waitlist, true);

    const withoutWaitlist = registerEventSchema.safeParse({ eventId: "evt_1", waitlist: false });
    assert.equal(withoutWaitlist.success, true);
    if (withoutWaitlist.success) assert.equal(withoutWaitlist.data.waitlist, false);
  });

  test("rejects a missing or empty eventId", () => {
    assert.equal(registerEventSchema.safeParse({}).success, false);
    assert.equal(registerEventSchema.safeParse({ eventId: "" }).success, false);
    assert.equal(registerEventSchema.safeParse({ eventId: "   " }).success, false);
  });
});
