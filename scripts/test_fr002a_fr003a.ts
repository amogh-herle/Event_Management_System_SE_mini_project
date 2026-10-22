/**
 * FR-002a (Login) + FR-003a (Role-based access control) smoke tests.
 * Needs a real Postgres behind DATABASE_URL and the dev server running.
 * Run:  BASE_URL=http://localhost:3000 npx ts-node -O '{"module":"commonjs"}' -r tsconfig-paths/register scripts/test_fr002a_fr003a.ts
 *
 * Test cases:
 *   TC-1  Valid credentials log in (200, session cookie set)
 *   TC-2  Wrong password rejected (401)
 *   TC-3  Unknown email rejected with the same message as TC-2 (no enumeration)
 *   TC-4  Unverified account blocked (403)
 *   TC-5  Suspended account blocked at login (403)
 *   TC-6  Real session with PARTICIPANT role cannot create an event (403) --
 *         proves the DB role governs, not a spoofable header
 *   TC-7  Real session with ORGANIZER role can create an event (201),
 *         attributed to that user's own id -- not the shared demo id
 *   TC-8  Suspending a user mid-session blocks their still-unexpired
 *         session on the very next request (401) -- "immediately loses
 *         access"
 *   TC-9  Logout clears the session cookie
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
  opts: { body?: unknown; cookie?: string } = {}
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.cookie) headers["Cookie"] = opts.cookie;
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
  // Capture the raw Set-Cookie value (including a cleared/empty one from
  // logout) and a reusable "session=..." pair for sending back on the next
  // request.
  const setCookieHeader = res.headers.get("set-cookie");
  const sessionCookie = setCookieHeader?.match(/session=[^;]*/)?.[0];
  return { status: res.status, json, sessionCookie, setCookieHeader };
}

async function makeUser(opts: {
  email: string;
  password: string;
  role: "ORGANIZER" | "PARTICIPANT" | "ADMIN";
  verified: boolean;
  suspended?: boolean;
}) {
  await prisma.user.deleteMany({ where: { email: opts.email } });
  const passwordHash = await bcrypt.hash(opts.password, 10);
  return prisma.user.create({
    data: {
      name: "Test " + opts.role,
      email: opts.email,
      passwordHash,
      role: opts.role,
      verified: opts.verified,
      suspended: opts.suspended ?? false,
    },
  });
}

async function run() {
  console.log("\n=== FR-002a / FR-003a Smoke Tests ===\n");

  const PASSWORD = "TestPass@123";

  // -- Setup --
  await makeUser({
    email: "login.ok@test.com",
    password: PASSWORD,
    role: "PARTICIPANT",
    verified: true,
  });
  await makeUser({
    email: "login.unverified@test.com",
    password: PASSWORD,
    role: "PARTICIPANT",
    verified: false,
  });
  await makeUser({
    email: "login.suspended@test.com",
    password: PASSWORD,
    role: "ORGANIZER",
    verified: true,
    suspended: true,
  });
  const participantUser = await makeUser({
    email: "rbac.participant@test.com",
    password: PASSWORD,
    role: "PARTICIPANT",
    verified: true,
  });
  const organizerUser = await makeUser({
    email: "rbac.organizer@test.com",
    password: PASSWORD,
    role: "ORGANIZER",
    verified: true,
  });

  // TC-1: Valid login
  const ok = await req("POST", "/api/auth/login", {
    body: { email: "login.ok@test.com", password: PASSWORD },
  });
  assert("TC-1: Valid credentials return 200", ok.status === 200);
  assert("TC-1: Login sets a session cookie", !!ok.sessionCookie);
  assert(
    "TC-1: Response never includes passwordHash",
    !JSON.stringify(ok.json).includes("passwordHash")
  );

  // TC-2: Wrong password
  const wrongPw = await req("POST", "/api/auth/login", {
    body: { email: "login.ok@test.com", password: "WrongPassword1" },
  });
  assert("TC-2: Wrong password returns 401", wrongPw.status === 401);

  // TC-3: Unknown email -- same message as wrong password (no enumeration)
  const unknown = await req("POST", "/api/auth/login", {
    body: { email: "nobody-at-all@test.com", password: PASSWORD },
  });
  assert("TC-3: Unknown email returns 401", unknown.status === 401);
  assert(
    "TC-3: Same error message as wrong-password case (no account enumeration)",
    (unknown.json as { error?: string }).error === (wrongPw.json as { error?: string }).error
  );

  // TC-4: Unverified account
  const unverified = await req("POST", "/api/auth/login", {
    body: { email: "login.unverified@test.com", password: PASSWORD },
  });
  assert("TC-4: Unverified account returns 403", unverified.status === 403);

  // TC-5: Suspended account blocked at login
  const suspendedLogin = await req("POST", "/api/auth/login", {
    body: { email: "login.suspended@test.com", password: PASSWORD },
  });
  assert("TC-5: Suspended account returns 403 at login", suspendedLogin.status === 403);

  // TC-6: Real PARTICIPANT session cannot create an event
  const participantLogin = await req("POST", "/api/auth/login", {
    body: { email: "rbac.participant@test.com", password: PASSWORD },
  });
  assert("TC-6 setup: participant login succeeds", participantLogin.status === 200);
  const participantCreate = await req("POST", "/api/events", {
    cookie: participantLogin.sessionCookie,
    body: {
      name: "Should Be Blocked",
      description: "RBAC test",
      date: "2026-12-10",
      time: "10:00 AM",
      venue: "Hall",
      category: "Technology",
      capacity: 10,
    },
  });
  assert(
    "TC-6: Real session with PARTICIPANT role is blocked from creating an event (403)",
    participantCreate.status === 403
  );

  // TC-7: Real ORGANIZER session can create an event, attributed to their own id
  const organizerLogin = await req("POST", "/api/auth/login", {
    body: { email: "rbac.organizer@test.com", password: PASSWORD },
  });
  assert("TC-7 setup: organizer login succeeds", organizerLogin.status === 200);
  const organizerCreate = await req("POST", "/api/events", {
    cookie: organizerLogin.sessionCookie,
    body: {
      name: "Real Session Event",
      description: "RBAC test",
      date: "2026-12-11",
      time: "11:00 AM",
      venue: "Hall B",
      category: "Technology",
      capacity: 20,
    },
  });
  assert("TC-7: Real session with ORGANIZER role creates an event (201)", organizerCreate.status === 201);
  const createdOrganizerId = (organizerCreate.json as { event?: { organizerId?: string } })?.event
    ?.organizerId;
  assert(
    "TC-7: Event is attributed to the real logged-in user's own id, not a shared demo id",
    createdOrganizerId === organizerUser.id && createdOrganizerId !== "organizer-demo-id"
  );

  // TC-8: Suspending mid-session blocks the still-unexpired session immediately
  await prisma.user.update({ where: { id: organizerUser.id }, data: { suspended: true } });
  const afterSuspend = await req("POST", "/api/events", {
    cookie: organizerLogin.sessionCookie,
    body: {
      name: "Should Be Blocked After Suspension",
      description: "RBAC test",
      date: "2026-12-12",
      time: "12:00 PM",
      venue: "Hall C",
      category: "Technology",
      capacity: 5,
    },
  });
  assert(
    "TC-8: A still-unexpired session for a now-suspended user is blocked (401) on the very next request",
    afterSuspend.status === 401
  );

  // TC-9: Logout clears the session cookie
  const logout = await req("POST", "/api/auth/logout", { cookie: participantLogin.sessionCookie });
  assert("TC-9: Logout returns 200", logout.status === 200);
  assert(
    "TC-9: Logout response clears the session cookie (Max-Age=0)",
    !!logout.setCookieHeader && /Max-Age=0/.test(logout.setCookieHeader)
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
