import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

process.env.SESSION_SECRET ||= "test-only-session-secret";

import {
  createSessionValue,
  verifySessionValue,
  readSessionCookie,
  sessionCookieHeader,
  clearSessionCookieHeader,
} from "../lib/session";

function signWith(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

describe("lib/session.ts", () => {
  test("getSecret throws when SESSION_SECRET is not set", async () => {
    const previous = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    try {
      const fresh: any = await import(`../lib/session.ts?case=${Date.now()}-${Math.random()}`);
      assert.throws(
        () => fresh.createSessionValue("user-1"),
        /SESSION_SECRET is not set/
      );
    } finally {
      if (previous === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = previous;
    }
  });

  test("createSessionValue + verifySessionValue round-trip for a valid cookie", () => {
    const value = createSessionValue("user-42");
    const userId = verifySessionValue(value);
    assert.equal(userId, "user-42");
  });

  test("verifySessionValue rejects a cookie with the wrong number of segments", () => {
    assert.equal(verifySessionValue("only.two"), null);
    assert.equal(verifySessionValue("way.too.many.segments.here"), null);
  });

  test("verifySessionValue rejects a tampered signature", () => {
    const value = createSessionValue("user-7");
    const [userId, expiresAtStr] = value.split(".");
    const tampered = `${userId}.${expiresAtStr}.${"a".repeat(64)}`;
    assert.equal(verifySessionValue(tampered), null);
  });

  test("verifySessionValue rejects a signature of the wrong length", () => {
    const value = createSessionValue("user-8");
    const [userId, expiresAtStr] = value.split(".");
    const tampered = `${userId}.${expiresAtStr}.abcd`;
    assert.equal(verifySessionValue(tampered), null);
  });

  test("verifySessionValue rejects an expired session", () => {
    const secret = process.env.SESSION_SECRET as string;
    const userId = "user-99";
    const expiresAt = Date.now() - 1000;
    const payload = `${userId}.${expiresAt}`;
    const signature = signWith(secret, payload);
    const expired = `${payload}.${signature}`;
    assert.equal(verifySessionValue(expired), null);
  });

  test("readSessionCookie extracts the session value from a cookie header", () => {
    const value = createSessionValue("user-5");
    const request = new Request("https://example.com", {
      headers: { cookie: `other=ignored; session=${encodeURIComponent(value)}; another=1` },
    });
    assert.equal(readSessionCookie(request), value);
  });

  test("readSessionCookie returns null when there is no session cookie", () => {
    const request = new Request("https://example.com", {
      headers: { cookie: "other=ignored" },
    });
    assert.equal(readSessionCookie(request), null);
  });

  test("readSessionCookie returns null when there is no cookie header at all", () => {
    const request = new Request("https://example.com");
    assert.equal(readSessionCookie(request), null);
  });

  test("sessionCookieHeader omits Secure outside production", () => {
    const previous = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = "test";
    try {
      const header = sessionCookieHeader("user-1");
      assert.match(header, /^session=/);
      assert.match(header, /HttpOnly; SameSite=Lax; Max-Age=\d+$/);
      assert.ok(!header.includes("Secure"));
    } finally {
      (process.env as any).NODE_ENV = previous;
    }
  });

  test("sessionCookieHeader appends Secure in production", () => {
    const previous = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = "production";
    try {
      const header = sessionCookieHeader("user-1");
      assert.match(header, /Secure$/);
    } finally {
      (process.env as any).NODE_ENV = previous;
    }
  });

  test("clearSessionCookieHeader omits Secure outside production", () => {
    const previous = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = "test";
    try {
      const header = clearSessionCookieHeader();
      assert.equal(header, "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    } finally {
      (process.env as any).NODE_ENV = previous;
    }
  });

  test("clearSessionCookieHeader appends Secure in production", () => {
    const previous = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = "production";
    try {
      const header = clearSessionCookieHeader();
      assert.match(header, /Secure$/);
    } finally {
      (process.env as any).NODE_ENV = previous;
    }
  });
});
