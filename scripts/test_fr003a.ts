/**
 * FR-003a (Role-based access control via real sessions) smoke tests.
 * Depends on FR-002a (login) already being present on this branch.
 * Needs a real Postgres behind DATABASE_URL and the dev server running.
 * Run:  BASE_URL=http://localhost:3000 npx ts-node -O '{"module":"commonjs"}' -r tsconfig-paths/register scripts/test_fr003a.ts
 *
 * Test cases:
 *   TC-1  Real session with PARTICIPANT role cannot create an event (403) --
 *         proves the DB role governs, not a spoofable header
 *   TC-2  Real session with ORGANIZER role can create an event (201),
 *         attributed to that user's own id -- not the shared demo id
 *   TC-3  Suspending a user mid-session blocks their still-unexpired
 *         session on the very next request (401) -- "immediately loses
 *         access"
 *   TC-4  The pre-existing demo x-user-role header still works when
 *         there's no session at all (backward compatibility with
 *         FR-004a/FR-005a's RoleSwitcher UI)
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const BASE = process.env.BASE_URL || "http://localhost:3000";

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

async function req(
  method: string,
  path: string,
  opts: { body?: unknown; cookie?: string; role?: string } = {}
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.cookie) headers["Cookie"] = opts.cookie;
  if (opts.role) headers["x-user-role"] = opts.role;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  const setCookieHeader = res.headers.get("set-cookie");
  const sessionCookie = setCookieHeader?.match(/session=[^;]*/)?.[0];
  return { status: res.status, json, sessionCookie };
}

async function makeUser(opts: {
  email: string;
  password: string;
  role: "ORGANIZER" | "PARTICIPANT" | "ADMIN";
}) {
  await prisma.user.deleteMany({ where: { email: opts.email } });
  const passwordHash = await bcrypt.hash(opts.password, 10);
  return prisma.user.create({
    data: {
      name: "Test " + opts.role,
      email: opts.email,
      passwordHash,
      role: opts.role,
      verified: true,
    },
  });
}

const eventBody = (overrides: Partial<Record<string, unknown>> = {}) => ({
  name: "RBAC Test Event",
  description: "RBAC test",
  date: "2026-12-10",
  time: "10:00 AM",
  venue: "Hall",
  category: "Technology",
  capacity: 10,
  ...overrides,
});

async function run() {
  console.log("\n=== FR-003a Smoke Tests ===\n");

  const PASSWORD = "TestPass@123";

  await makeUser({
    email: "rbac.participant@test.com",
    password: PASSWORD,
    role: "PARTICIPANT",
  });
  const organizerUser = await makeUser({
    email: "rbac.organizer@test.com",
    password: PASSWORD,
    role: "ORGANIZER",
  });

  // TC-1: Real PARTICIPANT session cannot create an event
  const participantLogin = await req("POST", "/api/auth/login", {
    body: { email: "rbac.participant@test.com", password: PASSWORD },
  });
  assert("TC-1 setup: participant login succeeds", participantLogin.status === 200);
  const participantCreate = await req("POST", "/api/events", {
    cookie: participantLogin.sessionCookie,
    body: eventBody({ name: "Should Be Blocked" }),
  });
  assert(
    "TC-1: Real session with PARTICIPANT role is blocked from creating an event (403)",
    participantCreate.status === 403
  );

  // TC-2: Real ORGANIZER session can create an event, attributed to their own id
  const organizerLogin = await req("POST", "/api/auth/login", {
    body: { email: "rbac.organizer@test.com", password: PASSWORD },
  });
  assert("TC-2 setup: organizer login succeeds", organizerLogin.status === 200);
  const organizerCreate = await req("POST", "/api/events", {
    cookie: organizerLogin.sessionCookie,
    body: eventBody({ name: "Real Session Event" }),
  });
  assert("TC-2: Real session with ORGANIZER role creates an event (201)", organizerCreate.status === 201);
  const createdOrganizerId = (organizerCreate.json as { event?: { organizerId?: string } })?.event
    ?.organizerId;
  assert(
    "TC-2: Event is attributed to the real logged-in user's own id, not a shared demo id",
    createdOrganizerId === organizerUser.id && createdOrganizerId !== "organizer-demo-id"
  );

  // TC-3: Suspending mid-session blocks the still-unexpired session immediately
  await prisma.user.update({ where: { id: organizerUser.id }, data: { suspended: true } });
  const afterSuspend = await req("POST", "/api/events", {
    cookie: organizerLogin.sessionCookie,
    body: eventBody({ name: "Should Be Blocked After Suspension" }),
  });
  assert(
    "TC-3: A still-unexpired session for a now-suspended user is blocked (401) on the very next request",
    afterSuspend.status === 401
  );

  // TC-4: Demo header still works with no session at all (backward compatibility)
  const demoCreate = await req("POST", "/api/events", {
    role: "ORGANIZER",
    body: eventBody({ name: "Demo Header Still Works" }),
  });
  assert(
    "TC-4: The demo x-user-role header still creates an event when there's no session",
    demoCreate.status === 201
  );
  const demoOrganizerId = (demoCreate.json as { event?: { organizerId?: string } })?.event?.organizerId;
  assert(
    "TC-4: Demo header still attributes to the shared demo id, as before",
    demoOrganizerId === "organizer-demo-id"
  );

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
