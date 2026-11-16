/**
 * FR-001a/b (signup + email verification), FR-003b (profile update) and
 * FR-003c (admin view/suspend/delete users) live-API tests.
 * Needs a real Postgres behind DATABASE_URL and the app server running.
 * Run:  BASE_URL=http://localhost:3000 npx tsx scripts/test_fr001_fr003bc.ts
 *
 *   FR-001a  TC-1 valid signup -> 201, unverified   TC-2 bad email -> 400
 *            TC-3 duplicate email -> 409            TC-4 password stored as bcrypt hash
 *            TC-5 unverified account cannot log in (403)
 *   FR-001b  TC-6 valid token activates account     TC-7 login works after verify
 *            TC-8 token is single-use               TC-9 expired token rejected
 *            TC-10 garbage token rejected
 *   FR-003b  TC-11 profile name update persists     TC-12 unauthenticated -> 401
 *            TC-13 empty name -> 400                TC-14 role cannot be self-escalated
 *   FR-003c  TC-15 admin lists users                TC-16 non-admin -> 403
 *            TC-17 suspend blocks login + live session  TC-18 unsuspend restores login
 *            TC-19 admin cannot suspend self         TC-20 delete removes account
 *            TC-21 non-admin delete -> 403
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { createVerificationToken, hashToken } from "../lib/tokens";

const prisma = new PrismaClient();
const BASE = process.env.BASE_URL || "http://localhost:3000";
const RUN = Date.now();
const email = (tag: string) => `fr001-003-${tag}-${RUN}@test.local`;

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

async function req(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.cookie) headers["Cookie"] = opts.cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  const sessionCookie = res.headers.get("set-cookie")?.match(/session=[^;]*/)?.[0];
  return { status: res.status, json, sessionCookie };
}

async function makeUser(tag: string, role: "ADMIN" | "ORGANIZER" | "PARTICIPANT", password: string) {
  return prisma.user.create({
    data: {
      name: `Test ${tag}`,
      email: email(tag),
      passwordHash: await bcrypt.hash(password, 10),
      role,
      verified: true,
    },
  });
}

async function run() {
  const PW = "Passw0rd!x";

  console.log("\nFR-001a — account creation");
  const su = await req("POST", "/api/auth/signup", {
    body: { name: "Amit Rao", email: email("signup"), password: PW, role: "PARTICIPANT" },
  });
  assert("TC-1: valid signup returns 201", su.status === 201);
  assert("TC-1: new account is unverified", su.json?.verified === false);
  assert("TC-2: malformed email rejected (400)", (await req("POST", "/api/auth/signup", {
    body: { name: "X", email: "amitrao@@test", password: PW, role: "PARTICIPANT" },
  })).status === 400);
  assert("TC-3: duplicate email rejected (409)", (await req("POST", "/api/auth/signup", {
    body: { name: "Amit Again", email: email("signup"), password: PW, role: "PARTICIPANT" },
  })).status === 409);
  const row = await prisma.user.findUnique({ where: { email: email("signup") } });
  assert("TC-4: password stored as a bcrypt hash, never plain text",
    !!row && row.passwordHash.startsWith("$2") && row.passwordHash !== PW);
  assert("TC-5: unverified account cannot log in (403)", (await req("POST", "/api/auth/login", {
    body: { email: email("signup"), password: PW },
  })).status === 403);

  console.log("\nFR-001b — email verification");
  const rawToken = await createVerificationToken(row!.id);
  assert("TC-6: valid token activates the account (200)", (await req("POST", "/api/auth/verify", { body: { token: rawToken } })).status === 200);
  assert("TC-7: login succeeds after verification (200)", (await req("POST", "/api/auth/login", {
    body: { email: email("signup"), password: PW },
  })).status === 200);
  const reuse = await req("POST", "/api/auth/verify", { body: { token: rawToken } });
  assert("TC-8: a used token is rejected (400)", reuse.status === 400);
  const expRaw = crypto.randomBytes(16).toString("hex");
  await prisma.verificationToken.create({
    data: { userId: row!.id, tokenHash: hashToken(expRaw), expiresAt: new Date(Date.now() - 1000) },
  });
  const exp = await req("POST", "/api/auth/verify", { body: { token: expRaw } });
  assert("TC-9: an expired token is rejected as expired (400)", exp.status === 400 && exp.json?.status === "expired");
  const bad = await req("POST", "/api/auth/verify", { body: { token: "not-a-real-token" } });
  assert("TC-10: a garbage token is rejected as invalid (400)", bad.status === 400 && bad.json?.status === "invalid");

  console.log("\nFR-003b — profile update");
  const login = await req("POST", "/api/auth/login", { body: { email: email("signup"), password: PW } });
  const cookie = login.sessionCookie!;
  const upd = await req("PATCH", "/api/auth/me", { cookie, body: { name: "Amit R. Rao" } });
  const me = await req("GET", "/api/auth/me", { cookie });
  assert("TC-11: name update returns 200 and persists on next read",
    upd.status === 200 && JSON.stringify(me.json).includes("Amit R. Rao"));
  assert("TC-12: unauthenticated profile update rejected (401)", (await req("PATCH", "/api/auth/me", { body: { name: "Z" } })).status === 401);
  assert("TC-13: empty name rejected (400)", (await req("PATCH", "/api/auth/me", { cookie, body: { name: "" } })).status === 400);
  await req("PATCH", "/api/auth/me", { cookie, body: { name: "Amit R. Rao", role: "ADMIN" } });
  const after = await prisma.user.findUnique({ where: { email: email("signup") } });
  assert("TC-14: a user cannot escalate their own role via the profile endpoint", after?.role === "PARTICIPANT");

  console.log("\nFR-003c — admin account management");
  const admin = await makeUser("admin", "ADMIN", PW);
  const target = await makeUser("target", "PARTICIPANT", PW);
  const aCookie = (await req("POST", "/api/auth/login", { body: { email: email("admin"), password: PW } })).sessionCookie!;
  const tCookie = (await req("POST", "/api/auth/login", { body: { email: email("target"), password: PW } })).sessionCookie!;
  const list = await req("GET", "/api/admin/users", { cookie: aCookie });
  assert("TC-15: admin can list users (200, target present)", list.status === 200 && JSON.stringify(list.json).includes(target.id));
  assert("TC-16: non-admin cannot list users (403)", (await req("GET", "/api/admin/users", { cookie: tCookie })).status === 403);
  const sus = await req("PATCH", `/api/admin/users/${target.id}`, { cookie: aCookie, body: { action: "suspend" } });
  const lg = await req("POST", "/api/auth/login", { body: { email: email("target"), password: PW } });
  const live = await req("GET", "/api/auth/me", { cookie: tCookie });
  // /api/auth/me answers 200 { user: null } for a session that is no longer valid.
  assert("TC-17: suspend returns 200, blocks new login (403) and invalidates the live session",
    sus.status === 200 && lg.status === 403 && live.status === 200 && live.json?.user === null);
  await req("PATCH", `/api/admin/users/${target.id}`, { cookie: aCookie, body: { action: "unsuspend" } });
  assert("TC-18: unsuspend restores login (200)", (await req("POST", "/api/auth/login", { body: { email: email("target"), password: PW } })).status === 200);
  assert("TC-19: admin cannot suspend their own account (400)",
    (await req("PATCH", `/api/admin/users/${admin.id}`, { cookie: aCookie, body: { action: "suspend" } })).status === 400);
  assert("TC-21: non-admin cannot delete a user (403)", (await req("DELETE", `/api/admin/users/${target.id}`, { cookie: tCookie })).status === 403);
  const del = await req("DELETE", `/api/admin/users/${target.id}`, { cookie: aCookie });
  const gone = await req("POST", "/api/auth/login", { body: { email: email("target"), password: PW } });
  assert("TC-20: delete returns 204 and the account can no longer log in (401)", del.status === 204 && gone.status === 401);
}

run()
  .catch((err) => {
    console.error("Unexpected error:", err);
    failed++;
  })
  .finally(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: `-${RUN}@test.local` } } });
    await prisma.$disconnect();
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  });
