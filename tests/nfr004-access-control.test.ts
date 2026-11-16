import { test, describe } from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET ||= "test-only-session-secret";

import { MAX_FAILED_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MS, isLocked, nextFailureState } from "../lib/loginLockout";
import { isCrossSiteRequest } from "../lib/csrf";
import { renewSessionValue, SESSION_IDLE_TIMEOUT_MS } from "../lib/sessionEdge";
import { createSessionValue, verifySessionValue, sessionCookieHeader } from "../lib/session";
import { getAuthUserFromRequest } from "../lib/auth";
import { logEvent } from "../lib/auditLog";
import { prisma } from "../lib/prisma";

describe("NFR-004 / SRSec 2.3 account lockout", () => {
  test("SEC_03: the fifth consecutive failure locks the account for 15 minutes", () => {
    const now = 1_000_000;
    let attempts = 0;
    for (let i = 1; i < MAX_FAILED_LOGIN_ATTEMPTS; i++) {
      const s = nextFailureState(attempts, now);
      assert.equal(s.locked, false);
      assert.equal(s.lockedUntil, null);
      attempts = s.failedLoginAttempts;
    }
    const last = nextFailureState(attempts, now);
    assert.equal(last.locked, true);
    assert.equal(last.lockedUntil!.getTime(), now + LOCKOUT_DURATION_MS);
    assert.equal(last.failedLoginAttempts, 0);
  });

  test("isLocked is true only until lockedUntil passes", () => {
    const until = new Date(5_000);
    assert.equal(isLocked(until, 4_999), true);
    assert.equal(isLocked(until, 5_000), false);
    assert.equal(isLocked(null), false);
  });
});

describe("NFR-004 / SRSec 2.2 30-minute idle timeout", () => {
  test("SEC_11: new sessions expire 30 minutes out", () => {
    const header = sessionCookieHeader("u1");
    assert.match(header, /Max-Age=1800;?/);
  });

  test("an expired session no longer verifies", () => {
    const realNow = Date.now;
    Date.now = () => realNow() - 31 * 60 * 1000;
    const stale = createSessionValue("u1");
    Date.now = realNow;
    assert.equal(verifySessionValue(stale), null);
  });

  test("activity renews the session by a fresh 30 minutes", async () => {
    const original = createSessionValue("u7");
    const later = Date.now() + 20 * 60 * 1000;
    const renewed = await renewSessionValue(original, process.env.SESSION_SECRET!, later);
    assert.ok(renewed);
    assert.equal(verifySessionValue(renewed!), "u7");
    assert.ok(Number(renewed!.split(".")[1]) >= later + SESSION_IDLE_TIMEOUT_MS);
  });

  test("an already-idle (expired) or tampered cookie is not renewed", async () => {
    const original = createSessionValue("u7");
    const past = Date.now() + 31 * 60 * 1000;
    assert.equal(await renewSessionValue(original, process.env.SESSION_SECRET!, past), null);
    const [id, exp, sig] = original.split(".");
    assert.equal(await renewSessionValue(`other.${exp}.${sig}`, process.env.SESSION_SECRET!), null);
    assert.equal(await renewSessionValue("garbage", process.env.SESSION_SECRET!), null);
  });
});

describe("SRSec 5.3 CSRF", () => {
  test("SEC_09: a cross-origin state-changing request is rejected", () => {
    assert.equal(isCrossSiteRequest("POST", "https://evil.example", "ems.local:3000"), true);
    assert.equal(isCrossSiteRequest("DELETE", "not a url", "ems.local:3000"), true);
  });

  test("same-origin, safe-method and origin-less requests pass", () => {
    assert.equal(isCrossSiteRequest("POST", "http://ems.local:3000", "ems.local:3000"), false);
    assert.equal(isCrossSiteRequest("GET", "https://evil.example", "ems.local:3000"), false);
    assert.equal(isCrossSiteRequest("POST", null, "ems.local:3000"), false);
  });
});

describe("SEC_13 demo role claim", () => {
  function claimRequest() {
    return new Request("http://localhost/api/events", { method: "POST", headers: { "x-user-role": "ORGANIZER" } });
  }

  test("honoured outside production", async () => {
    const user = await getAuthUserFromRequest(claimRequest());
    assert.equal(user?.role, "ORGANIZER");
  });

  test("ignored in production: unauthenticated caller gets no identity", async () => {
    const env = process.env as Record<string, string | undefined>;
    const previous = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      assert.equal(await getAuthUserFromRequest(claimRequest()), null);
    } finally {
      env.NODE_ENV = previous;
    }
  });
});

describe("NFR-004 / SRSec 6 audit log", () => {
  test("logEvent writes a record and never throws when the write fails", async () => {
    const calls: any[] = [];
    const original = Object.getOwnPropertyDescriptor(prisma, "auditLog");
    Object.defineProperty(prisma, "auditLog", {
      configurable: true,
      value: { create: async (arg: any) => { calls.push(arg); } },
    });
    await logEvent({ severity: "WARN", action: "user.deleted", actorId: "a1", actorRole: "ADMIN", details: "target=u2" });
    assert.equal(calls[0].data.action, "user.deleted");
    assert.equal(calls[0].data.severity, "WARN");

    Object.defineProperty(prisma, "auditLog", {
      configurable: true,
      value: { create: async () => { throw new Error("db down"); } },
    });
    const origError = console.error;
    console.error = () => {};
    try {
      await assert.doesNotReject(logEvent({ severity: "ERROR", action: "x" }));
    } finally {
      console.error = origError;
      if (original) Object.defineProperty(prisma, "auditLog", original);
      else delete (prisma as any).auditLog;
    }
  });
});
