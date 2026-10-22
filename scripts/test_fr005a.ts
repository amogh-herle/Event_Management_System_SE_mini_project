/**
 * FR-005a Acceptance Criteria Smoke Tests
 * Run against a local dev server:  npx ts-node scripts/test_fr005a.ts
 *
 * Test cases:
 *   TC-1 (AC-1) Cancel removes event from active listing
 *   TC-2 (AC-1) Cancelled event returns status=CANCELLED
 *   TC-2b       Already-cancelled event returns 409
 *   TC-3 (AC-2) Cancelled event NOT returned when ?active=true
 *   TC-4        Non-organizer cannot cancel (403)
 *   TC-5        Delete removes event permanently
 *   TC-6        Non-organizer cannot delete (403)
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";

async function req(
  method: string,
  path: string,
  opts: { role?: string; body?: unknown } = {}
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-user-role": opts.role ?? "ORGANIZER",
  };
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

let passed = 0;
let failed = 0;

function assert(label: string, cond: boolean) {
  if (cond) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

async function run() {
  console.log("\n=== FR-005a Smoke Tests ===\n");

  // -- Setup: create a test event --
  const created = await req("POST", "/api/events", {
    body: {
      name: "Test Cancel Event",
      description: "Test event for FR-005a cancel test",
      date: "2026-12-01",
      time: "10:00 AM",
      venue: "Test Hall",
      category: "Technology",
      capacity: 50,
    },
  });
  assert("Create test event returns 201", created.status === 201);
  const eventId = (created.json as { event: { id: string } })?.event?.id;
  assert("Created event has an id", !!eventId);

  // TC-1 & TC-2: Cancel event
  const cancel = await req("PATCH", `/api/events/${eventId}`, {
    body: { action: "cancel" },
  });
  assert("TC-2: Cancel returns 200", cancel.status === 200);
  assert(
    "TC-2: Cancelled event status is CANCELLED",
    (cancel.json as { event: { status: string } })?.event?.status === "CANCELLED"
  );

  // TC-2b: Already cancelled → 409
  const cancel2 = await req("PATCH", `/api/events/${eventId}`, {
    body: { action: "cancel" },
  });
  assert("TC-2b: Already-cancelled event returns 409", cancel2.status === 409);

  // TC-3: Not in active listing
  const activeList = await req("GET", "/api/events?active=true");
  const activeEvents = (activeList.json as { events: Array<{ id: string }> })?.events ?? [];
  assert(
    "TC-3: Cancelled event absent from ?active=true listing",
    !activeEvents.find((e) => e.id === eventId)
  );

  // TC-4: Participant cannot cancel
  const created2 = await req("POST", "/api/events", {
    body: {
      name: "Test Delete Event",
      description: "Test event for FR-005a delete test",
      date: "2026-12-02",
      time: "11:00 AM",
      venue: "Test Hall B",
      category: "Workshops",
      capacity: 30,
    },
  });
  const eventId2 = (created2.json as { event: { id: string } })?.event?.id;
  const badCancel = await req("PATCH", `/api/events/${eventId2}`, {
    role: "PARTICIPANT",
    body: { action: "cancel" },
  });
  assert("TC-4: Participant cancel blocked (403)", badCancel.status === 403);

  // TC-5: Delete event
  const del = await req("DELETE", `/api/events/${eventId2}`);
  assert("TC-5: Delete returns 204", del.status === 204);

  // TC-5b: Deleted event 404
  const getDeleted = await req("GET", `/api/events/${eventId2}`);
  assert("TC-5b: Deleted event returns 404", getDeleted.status === 404);

  // TC-6: Participant cannot delete
  const created3 = await req("POST", "/api/events", {
    body: {
      name: "Protected Event",
      description: "Should not be deletable by participant",
      date: "2026-12-03",
      time: "02:00 PM",
      venue: "Library",
      category: "Academic",
      capacity: 20,
    },
  });
  const eventId3 = (created3.json as { event: { id: string } })?.event?.id;
  const badDel = await req("DELETE", `/api/events/${eventId3}`, {
    role: "PARTICIPANT",
  });
  assert("TC-6: Participant delete blocked (403)", badDel.status === 403);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => { console.error(err); process.exit(1); });
