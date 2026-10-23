import test from "node:test";
import assert from "node:assert/strict";
import { POST as registerEventRoutePost, GET as registerEventRouteGet } from "../app/api/events/[id]/register/route";
import { POST as registrationsRoutePost, GET as registrationsRouteGet } from "../app/api/registrations/route";
import {
  DUPLICATE_REGISTRATION_ERROR,
  EVENT_CANCELLED_ERROR,
  EVENT_NOT_FOUND_ERROR,
  AUTH_REQUIRED_ERROR,
  EVENT_FULL_ERROR,
} from "../lib/registration";
import { prisma } from "../lib/prisma";
import { Prisma, RegistrationStatus, EventStatus, Role } from "@prisma/client";
import { createSessionValue } from "../lib/session";

process.env.SESSION_SECRET ||= "test-only-session-secret";

// Identity is resolved from a real signed session cookie (never from
// client-supplied headers/body) — this is what each test now authenticates
// as, matching how the routes actually determine "who is this request".
function sessionCookieFor(userId: string) {
  return { Cookie: `session=${createSessionValue(userId)}` };
}

function createMockDb() {
  const users = new Map<string, any>();
  const events = new Map<string, any>();
  const registrations = new Map<string, any>();

  let counter = 1;

  users.set("u1", {
    id: "u1",
    name: "Amit Rao",
    email: "amit.rao@test.com",
    role: Role.PARTICIPANT,
    suspended: false,
  });

  users.set("u2", {
    id: "u2",
    name: "Priya Nair",
    email: "priya.nair@test.com",
    role: Role.PARTICIPANT,
    suspended: false,
  });

  users.set("u_seed", {
    id: "u_seed",
    name: "Seed User",
    email: "seed@test.com",
    role: Role.PARTICIPANT,
    suspended: false,
  });

  events.set("evt1", {
    id: "evt1",
    name: "Tech Fest",
    title: "Tech Fest",
    date: new Date("2026-10-10"),
    status: EventStatus.ACTIVE,
    isCancelled: false,
    capacity: 100,
  });

  events.set("evt_cancelled", {
    id: "evt_cancelled",
    name: "Cancelled Tech Fest",
    title: "Cancelled Tech Fest",
    date: new Date("2026-10-10"),
    status: EventStatus.CANCELLED,
    isCancelled: true,
    capacity: 50,
  });

  events.set("evt_full", {
    id: "evt_full",
    name: "Full Workshop",
    title: "Full Workshop",
    date: new Date("2026-10-15"),
    status: EventStatus.ACTIVE,
    isCancelled: false,
    capacity: 1,
  });

  // Seed 1 confirmed registration so evt_full has 0 seats left
  registrations.set("u_seed_evt_full", {
    id: "reg_seed_full_1",
    userId: "u_seed",
    eventId: "evt_full",
    status: RegistrationStatus.CONFIRMED,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return {
    users,
    events,
    registrations,

    user: {
      async findUnique({ where }: any) {
        if (where.id) return users.get(where.id) || null;
        if (where.email) {
          for (const u of users.values()) {
            if (u.email.toLowerCase() === where.email.toLowerCase()) return u;
          }
        }
        return null;
      },
    },

    event: {
      async findUnique({ where }: any) {
        return events.get(where.id) || null;
      },
    },

    registration: {
      async findUnique({ where }: any) {
        if (where.userId_eventId) {
          const key = `${where.userId_eventId.userId}_${where.userId_eventId.eventId}`;
          const record = registrations.get(key) || null;
          if (!record) return null;
          return {
            ...record,
            user: users.get(record.userId),
            event: events.get(record.eventId),
          };
        }
        return null;
      },

      async count({ where }: any = {}) {
        return Array.from(registrations.values()).filter((r) => {
          if (where?.userId && r.userId !== where.userId) return false;
          if (where?.eventId && r.eventId !== where.eventId) return false;
          if (where?.status && r.status !== where.status) return false;
          return true;
        }).length;
      },

      async create({ data, include }: any) {
        const key = `${data.userId}_${data.eventId}`;
        if (registrations.has(key)) {
          throw new Prisma.PrismaClientKnownRequestError(
            `Unique constraint failed`,
            { code: "P2002", clientVersion: "5.22.0" }
          );
        }
        const record = {
          id: `reg_${counter++}`,
          userId: data.userId,
          eventId: data.eventId,
          status: data.status || RegistrationStatus.CONFIRMED,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...(include?.user ? { user: users.get(data.userId) } : {}),
          ...(include?.event ? { event: events.get(data.eventId) } : {}),
        };
        registrations.set(key, record);
        return record;
      },

      async findMany({ where }: any = {}) {
        return Array.from(registrations.values())
          .filter((r) => {
            if (where?.userId && r.userId !== where.userId) return false;
            if (where?.eventId && r.eventId !== where.eventId) return false;
            if (where?.status && r.status !== where.status) return false;
            return true;
          })
          .map((r) => ({ ...r, user: users.get(r.userId), event: events.get(r.eventId) }));
      },
    },
  };
}

let mockDb = createMockDb();

test.beforeEach(() => {
  mockDb = createMockDb();
  (prisma as any).user = mockDb.user;
  (prisma as any).event = mockDb.event;
  (prisma as any).registration = mockDb.registration;
  // registerForEvent runs its core logic inside a transaction on the real
  // client; these tests swap out the model methods above but have no real
  // DB connection, so stub $transaction to just run the callback against
  // the same (already-mocked) client instead of opening a real one.
  (prisma as any).$transaction = async (fn: any) => fn(prisma);
});

test("API: POST /api/events/[id]/register returns 400 on malformed JSON", async () => {
  const req = new Request("http://localhost:3000/api/events/evt1/register", {
    method: "POST",
    body: "{ malformed json",
    headers: { "Content-Type": "application/json" },
  });

  const res = await registerEventRoutePost(req, { params: { id: "evt1" } });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, "Invalid request body");
});

test("API: POST /api/events/[id]/register registers the session user", async () => {
  const req = new Request("http://localhost:3000/api/events/evt1/register", {
    method: "POST",
    headers: sessionCookieFor("u1"),
  });

  const res = await registerEventRoutePost(req, { params: { id: "evt1" } });
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.status, "confirmed");
  assert.equal(data.userId, "u1");
  assert.equal(data.eventId, "evt1");
  assert.ok(data.timestamp);
});

test("API: POST /api/events/[id]/register ignores a client-supplied userId and uses the session instead", async () => {
  // u2's session, but the body/header both claim to be u1 — must register u2, not u1.
  const req = new Request("http://localhost:3000/api/events/evt1/register", {
    method: "POST",
    headers: { ...sessionCookieFor("u2"), "x-user-id": "u1", "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "u1", userEmail: "amit.rao@test.com" }),
  });

  const res = await registerEventRoutePost(req, { params: { id: "evt1" } });
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.userId, "u2");
});

test("API: POST /api/events/[id]/register returns 409 when user is already registered", async () => {
  // First request succeeds
  const req1 = new Request("http://localhost:3000/api/events/evt1/register", {
    method: "POST",
    headers: sessionCookieFor("u1"),
  });
  const res1 = await registerEventRoutePost(req1, { params: { id: "evt1" } });
  assert.equal(res1.status, 201);

  // Second request returns 409 duplicate error, with the existing registration's real data
  const req2 = new Request("http://localhost:3000/api/events/evt1/register", {
    method: "POST",
    headers: sessionCookieFor("u1"),
  });
  const res2 = await registerEventRoutePost(req2, { params: { id: "evt1" } });
  assert.equal(res2.status, 409);
  const data2 = await res2.json();
  assert.equal(data2.error, DUPLICATE_REGISTRATION_ERROR);
  assert.equal(data2.registration?.status, "confirmed");
  assert.equal(data2.registration?.userId, "u1");
});

test("API: POST /api/events/[id]/register returns 400 when event is cancelled", async () => {
  const req = new Request("http://localhost:3000/api/events/evt_cancelled/register", {
    method: "POST",
    headers: sessionCookieFor("u1"),
  });

  const res = await registerEventRoutePost(req, { params: { id: "evt_cancelled" } });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, EVENT_CANCELLED_ERROR);
});

test("API: POST /api/events/[id]/register returns 404 when event not found", async () => {
  const req = new Request("http://localhost:3000/api/events/non_existent/register", {
    method: "POST",
    headers: sessionCookieFor("u1"),
  });

  const res = await registerEventRoutePost(req, { params: { id: "non_existent" } });
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.error, EVENT_NOT_FOUND_ERROR);
});

test("API: POST /api/events/[id]/register returns 401 when no auth provided", async () => {
  const req = new Request("http://localhost:3000/api/events/evt1/register", {
    method: "POST",
  });

  const res = await registerEventRoutePost(req, { params: { id: "evt1" } });
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error, AUTH_REQUIRED_ERROR);
});

test("API: POST /api/events/[id]/register returns 401 for an unauthenticated x-user-id header (no longer trusted)", async () => {
  const req = new Request("http://localhost:3000/api/events/evt1/register", {
    method: "POST",
    headers: { "x-user-id": "u1" },
  });

  const res = await registerEventRoutePost(req, { params: { id: "evt1" } });
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error, AUTH_REQUIRED_ERROR);
});

test("API: POST /api/events/[id]/register returns 400 when event is full", async () => {
  const req = new Request("http://localhost:3000/api/events/evt_full/register", {
    method: "POST",
    headers: sessionCookieFor("u2"),
  });

  const res = await registerEventRoutePost(req, { params: { id: "evt_full" } });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, EVENT_FULL_ERROR);
});

test("API: GET /api/events/[id]/register returns 401 when no auth provided", async () => {
  const req = new Request("http://localhost:3000/api/events/evt1/register", {
    method: "GET",
  });

  const res = await registerEventRouteGet(req, { params: { id: "evt1" } });
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error, AUTH_REQUIRED_ERROR);
});

test("API: GET /api/events/[id]/register returns registration state for the session user", async () => {
  // Initially false
  const req1 = new Request("http://localhost:3000/api/events/evt1/register", {
    method: "GET",
    headers: sessionCookieFor("u1"),
  });
  const res1 = await registerEventRouteGet(req1, { params: { id: "evt1" } });
  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  assert.equal(data1.registered, false);

  // After registration
  await registerEventRoutePost(
    new Request("http://localhost:3000/api/events/evt1/register", {
      method: "POST",
      headers: sessionCookieFor("u1"),
    }),
    { params: { id: "evt1" } }
  );

  const req2 = new Request("http://localhost:3000/api/events/evt1/register", {
    method: "GET",
    headers: sessionCookieFor("u1"),
  });
  const res2 = await registerEventRouteGet(req2, { params: { id: "evt1" } });
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.registered, true);
  assert.equal(data2.registration?.status, "confirmed");
});

test("API: GET /api/events/[id]/register ignores a client-supplied userId query param and only reports the session user's own status", async () => {
  await registerEventRoutePost(
    new Request("http://localhost:3000/api/events/evt1/register", {
      method: "POST",
      headers: sessionCookieFor("u1"),
    }),
    { params: { id: "evt1" } }
  );

  // u2's session, but the query string claims to be u1 — must report u2 (not registered).
  const req = new Request("http://localhost:3000/api/events/evt1/register?userId=u1", {
    method: "GET",
    headers: sessionCookieFor("u2"),
  });
  const res = await registerEventRouteGet(req, { params: { id: "evt1" } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.registered, false);
});

test("API: POST /api/registrations returns 400 when eventId is missing", async () => {
  const req = new Request("http://localhost:3000/api/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sessionCookieFor("u1") },
    body: JSON.stringify({}),
  });

  const res = await registrationsRoutePost(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.ok(data.error);
});

test("API: POST /api/registrations returns 401 when no session is present", async () => {
  const req = new Request("http://localhost:3000/api/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId: "evt1" }),
  });

  const res = await registrationsRoutePost(req);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error, AUTH_REQUIRED_ERROR);
});

test("API: POST /api/registrations returns 400 when event is full", async () => {
  const req = new Request("http://localhost:3000/api/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sessionCookieFor("u2") },
    body: JSON.stringify({ eventId: "evt_full" }),
  });

  const res = await registrationsRoutePost(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, EVENT_FULL_ERROR);
});

test("API: POST /api/registrations creates registration and GET lists it for the session user", async () => {
  const reqPost = new Request("http://localhost:3000/api/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sessionCookieFor("u1") },
    body: JSON.stringify({ eventId: "evt1" }),
  });

  const resPost = await registrationsRoutePost(reqPost);
  assert.equal(resPost.status, 201);
  const dataPost = await resPost.json();
  assert.equal(dataPost.status, "confirmed");

  const reqGet = new Request("http://localhost:3000/api/registrations", {
    method: "GET",
    headers: sessionCookieFor("u1"),
  });
  const resGet = await registrationsRouteGet(reqGet);
  assert.equal(resGet.status, 200);
  const dataGet = await resGet.json();
  assert.equal(dataGet.registrations.length, 1);
  assert.equal(dataGet.registrations[0].userId, "u1");
  assert.equal(dataGet.registrations[0].eventId, "evt1");
  assert.equal(dataGet.registrations[0].status, "confirmed");
});

test("API: GET /api/registrations does not leak another user's registrations via a userId query param", async () => {
  await registrationsRoutePost(
    new Request("http://localhost:3000/api/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sessionCookieFor("u1") },
      body: JSON.stringify({ eventId: "evt1" }),
    })
  );

  // u2's session, but the query string asks for u1's registrations.
  const req = new Request("http://localhost:3000/api/registrations?userId=u1", {
    method: "GET",
    headers: sessionCookieFor("u2"),
  });
  const res = await registrationsRouteGet(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.registrations.length, 0);
});
