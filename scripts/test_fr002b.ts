/**
 * FR-002b (Forgot password reset via emailed link) smoke tests.
 * Needs a real Postgres behind DATABASE_URL and the dev server running.
 * Run:  BASE_URL=http://localhost:3000 npx ts-node -O '{"module":"commonjs"}' -r tsconfig-paths/register scripts/test_fr002b.ts
 *
 * Reads the raw reset token directly via lib/tokens.ts (same process as
 * creating it) rather than parsing it out of an actual email — this repo's
 * mailer falls back to a disposable Ethereal inbox in dev, so there's no
 * fixed inbox to scrape; what matters here is the token/expiry/consumption
 * logic, not SMTP delivery itself.
 *
 * Test cases:
 *   TC-1  Forgot-password for an existing account returns the generic 200 message
 *   TC-2  Forgot-password for an unknown email returns the SAME generic 200 (no enumeration)
 *   TC-3  A valid reset token sets a new password (200)
 *   TC-4  Old password no longer logs in (401); new password does (200)
 *   TC-5  Reusing an already-consumed token is rejected (400, invalid)
 *   TC-6  A garbage token is rejected (400, invalid)
 *   TC-7  An expired token is rejected (400, expired)
 *   TC-8  A weak new password is rejected by validation (400)
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createPasswordResetToken, hashToken } from "../lib/tokens";

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

async function req(method: string, path: string, opts: { body?: unknown } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function makeUser(email: string, password: string) {
  await prisma.user.deleteMany({ where: { email } });
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.create({
    data: { name: "Reset Test User", email, passwordHash, verified: true },
  });
}

async function run() {
  console.log("\n=== FR-002b Smoke Tests ===\n");

  const OLD_PASSWORD = "OldPass@123";
  const NEW_PASSWORD = "NewPass@456";
  const EMAIL = "reset.test@test.com";

  const user = await makeUser(EMAIL, OLD_PASSWORD);

  // TC-1: Forgot-password for an existing account
  const fp1 = await req("POST", "/api/auth/forgot-password", { body: { email: EMAIL } });
  assert("TC-1: Forgot-password for existing account returns 200", fp1.status === 200);

  // TC-2: Forgot-password for an unknown email — same response (no enumeration)
  const fp2 = await req("POST", "/api/auth/forgot-password", {
    body: { email: "nobody-at-all@test.com" },
  });
  assert("TC-2: Unknown email also returns 200", fp2.status === 200);
  assert(
    "TC-2: Same message as a real account (no account enumeration)",
    (fp1.json as { message?: string }).message === (fp2.json as { message?: string }).message
  );

  // TC-3: A valid reset token sets a new password
  const rawToken = await createPasswordResetToken(user.id);
  const reset1 = await req("POST", "/api/auth/reset-password", {
    body: { token: rawToken, password: NEW_PASSWORD },
  });
  assert("TC-3: Valid token resets password (200)", reset1.status === 200);

  // TC-4: Old password rejected, new password works
  const loginOld = await req("POST", "/api/auth/login", {
    body: { email: EMAIL, password: OLD_PASSWORD },
  });
  assert("TC-4: Old password no longer logs in (401)", loginOld.status === 401);

  const loginNew = await req("POST", "/api/auth/login", {
    body: { email: EMAIL, password: NEW_PASSWORD },
  });
  assert("TC-4: New password logs in (200)", loginNew.status === 200);

  // TC-5: Reusing the same (already-consumed) token
  const reset2 = await req("POST", "/api/auth/reset-password", {
    body: { token: rawToken, password: "AnotherPass@789" },
  });
  assert("TC-5: Reusing a consumed token is rejected (400)", reset2.status === 400);
  assert(
    "TC-5: Rejected as invalid, not expired",
    (reset2.json as { status?: string }).status === "invalid"
  );

  // TC-6: A garbage token
  const reset3 = await req("POST", "/api/auth/reset-password", {
    body: { token: "not-a-real-token", password: "AnotherPass@789" },
  });
  assert("TC-6: Garbage token is rejected (400, invalid)", reset3.status === 400);
  assert(
    "TC-6: Rejected as invalid",
    (reset3.json as { status?: string }).status === "invalid"
  );

  // TC-7: An expired token
  const expiredRaw = "expired-raw-token-for-test";
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(expiredRaw),
      expiresAt: new Date(Date.now() - 60 * 1000), // 1 minute in the past
    },
  });
  const reset4 = await req("POST", "/api/auth/reset-password", {
    body: { token: expiredRaw, password: "AnotherPass@789" },
  });
  assert("TC-7: Expired token is rejected (400, expired)", reset4.status === 400);
  assert(
    "TC-7: Rejected as expired specifically",
    (reset4.json as { status?: string }).status === "expired"
  );

  // TC-8: A weak new password
  const rawToken2 = await createPasswordResetToken(user.id);
  const reset5 = await req("POST", "/api/auth/reset-password", {
    body: { token: rawToken2, password: "short" },
  });
  assert("TC-8: Weak password rejected by validation (400)", reset5.status === 400);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
