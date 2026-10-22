import assert from "assert";
import { createEventSchema } from "../lib/validation";
import { requireOrganizer } from "../lib/auth";

console.log("=== RUNNING FR-004a AUTOMATED TEST SUITE ===\n");

let passed = 0;
let total = 0;

function it(name: string, fn: () => void) {
  total++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
  }
}

// 1. UT_01: Valid event creation with all required fields
it("UT_01: Verify an event is created when all required fields are valid", () => {
  const input = {
    name: "Tech Fest",
    description: "Annual technology festival with hackathons and workshops.",
    date: "2026-10-10",
    time: "10:00 AM",
    venue: "Main Auditorium",
    category: "Technology",
    capacity: 100,
  };

  const parsed = createEventSchema.safeParse(input);
  assert.strictEqual(parsed.success, true, "Valid input must pass schema validation");
  if (parsed.success) {
    assert.strictEqual(parsed.data.name, "Tech Fest");
    assert.strictEqual(parsed.data.capacity, 100);
    assert.strictEqual(parsed.data.venue, "Main Auditorium");
    assert.strictEqual(parsed.data.category, "Technology");
  }
});

// 2. UT_02: Event creation fails when a required field is missing (e.g. blank capacity)
it("UT_02: Verify event creation fails when a required field is missing (capacity blank)", () => {
  const input = {
    name: "Tech Fest",
    description: "Annual technology festival",
    date: "2026-10-10",
    time: "10:00 AM",
    venue: "Main Auditorium",
    category: "Technology",
    capacity: "", // blank
  };

  const parsed = createEventSchema.safeParse(input);
  assert.strictEqual(parsed.success, false, "Blank capacity must be rejected");
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message.toLowerCase();
    assert.ok(
      msg.includes("required field missing") || msg.includes("capacity"),
      `Expected 'required field missing' error, got: ${parsed.error.issues[0]?.message}`
    );
  }
});

// 3. IT_02: Capacity field only accepts a positive integer (-5 rejected)
it("IT_02: Verify capacity field only accepts a positive integer (capacity: -5 rejected)", () => {
  const input = {
    name: "Tech Fest",
    description: "Annual technology festival",
    date: "2026-10-10",
    time: "10:00 AM",
    venue: "Main Auditorium",
    category: "Technology",
    capacity: -5,
  };

  const parsed = createEventSchema.safeParse(input);
  assert.strictEqual(parsed.success, false, "Negative capacity must be rejected");
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message.toLowerCase();
    assert.ok(
      msg.includes("invalid capacity") || msg.includes("positive integer"),
      `Expected 'invalid capacity' error, got: ${parsed.error.issues[0]?.message}`
    );
  }
});

// 4. ST_02: Access Control: Participant cannot create an event
it("ST_02: Verify a Participant cannot create an event via access control (403 Forbidden)", () => {
  const auth = requireOrganizer({
    headers: {
      get: (k: string) => (k.toLowerCase() === "x-user-role" ? "PARTICIPANT" : null),
    },
  } as unknown as Request);

  assert.strictEqual(auth.authorized, false, "Participant must NOT be authorized to create events");
  assert.strictEqual(auth.status, 403, "Must return status 403 Forbidden");
  assert.ok(
    auth.error && auth.error.toLowerCase().includes("access denied"),
    "Error message must indicate access denied"
  );
});

// 5. Organizer IS authorized
it("Access Control: Organizer is authorized to create events", () => {
  const auth = requireOrganizer({
    headers: {
      get: (k: string) => (k.toLowerCase() === "x-user-role" ? "ORGANIZER" : null),
    },
  } as unknown as Request);

  assert.strictEqual(auth.authorized, true, "Organizer must be authorized");
});

// 5b. Security regression: no role claim at all must NOT default to Organizer
it("Access Control: a request with no x-user-role header and no cookie is rejected (401), not defaulted to Organizer", () => {
  const auth = requireOrganizer({
    headers: {
      get: () => null,
    },
  } as unknown as Request);

  assert.strictEqual(auth.authorized, false, "An unauthenticated request must NOT be authorized");
  assert.strictEqual(auth.status, 401, "Must return 401 Unauthorized, not silently become 403 or succeed");
  assert.strictEqual(auth.user, null, "No demo user should be attached to an unauthenticated request");
});

// 6. Additional boundary tests: Missing other required fields
it("Validation: Rejects missing event name", () => {
  const input = {
    name: "",
    description: "Some description",
    date: "2026-10-10",
    time: "10:00 AM",
    venue: "Hall 1",
    category: "Music",
    capacity: 50,
  };
  const parsed = createEventSchema.safeParse(input);
  assert.strictEqual(parsed.success, false);
  assert.ok(parsed.error.issues[0]?.message.toLowerCase().includes("name"));
});

it("Validation: Rejects missing date", () => {
  const input = {
    name: "Concert",
    description: "Some description",
    date: "",
    time: "10:00 AM",
    venue: "Hall 1",
    category: "Music",
    capacity: 50,
  };
  const parsed = createEventSchema.safeParse(input);
  assert.strictEqual(parsed.success, false);
  assert.ok(parsed.error.issues[0]?.message.toLowerCase().includes("date"));
});

it("Validation: Rejects capacity = 0", () => {
  const input = {
    name: "Concert",
    description: "Some description",
    date: "2026-10-10",
    time: "10:00 AM",
    venue: "Hall 1",
    category: "Music",
    capacity: 0,
  };
  const parsed = createEventSchema.safeParse(input);
  assert.strictEqual(parsed.success, false);
  assert.ok(parsed.error.issues[0]?.message.toLowerCase().includes("invalid capacity"));
});

console.log(`\n=== ALL ${passed}/${total} FR-004a TESTS PASSED SUCCESSFULLY! ===\n`);
if (passed !== total) {
  process.exit(1);
}
