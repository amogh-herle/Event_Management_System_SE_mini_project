import test from "node:test";
import assert from "node:assert/strict";
import {
  POST as registerEventRoutePost,
  GET as registerEventRouteGet,
  DELETE as registerEventRouteDelete,
} from "../app/api/events/[id]/register/route";
import {
  POST as registrationsRoutePost,
  GET as registrationsRouteGet,
  DELETE as registrationsRouteDelete,
} from "../app/api/registrations/route";
import {
  POST as waitlistRoutePost,
  GET as waitlistRouteGet,
  DELETE as waitlistRouteDelete,
} from "../app/api/events/[id]/waitlist/route";
import {
  POST as remindersRoutePost,
  GET as remindersRouteGet,
} from "../app/api/reminders/route";
import {
  GET as exportRouteGet,
} from "../app/api/events/[id]/export/route";
import {
  DUPLICATE_REGISTRATION_ERROR,
  EVENT_CANCELLED_ERROR,
  EVENT_NOT_FOUND_ERROR,
  AUTH_REQUIRED_ERROR,
  EVENT_FULL_ERROR,
  ALREADY_WAITLISTED_ERROR,
  onNotification,
  onWaitlistNotification,
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

  users.set("u_org", {
    id: "u_org",
    name: "Campus Organizer",
    email: "organizer@test.com",
    role: Role.ORGANIZER,
    suspended: false,
  });

  users.set("u_org2", {
    id: "u_org2",
    name: "Other Organizer",
    email: "other@test.com",
    role: Role.ORGANIZER,
    suspended: false,
  });

  users.set("u_admin", {
    id: "u_admin",
    name: "Admin User",
    email: "admin@test.com",
    role: Role.ADMIN,
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
    organizerId: "u_org",
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

      async upsert({ where, create }: any) {
        const existing = users.get(where.id);
        if (existing) return existing;
        users.set(where.id, { ...create, suspended: false });
        return users.get(where.id);
      },
    },

    event: {
      async findUnique({ where, include }: any) {
        const e = events.get(where.id) || null;
        if (!e) return null;
        return {
          ...e,
          ...(include?.organizer ? { organizer: users.get(e.organizerId) } : {}),
        };
      },
      async findMany({ where }: any = {}) {
        return Array.from(events.values()).filter((e) => {
          if (where?.status && e.status !== where.status) return false;
          if (where?.date?.gte && new Date(e.date).getTime() < new Date(where.date.gte).getTime()) return false;
          if (where?.date?.lte && new Date(e.date).getTime() > new Date(where.date.lte).getTime()) return false;
          return true;
        });
      },
    },

    registration: {
      async findUnique({ where, include }: any) {
        if (where?.userId_eventId) {
          const key = `${where.userId_eventId.userId}_${where.userId_eventId.eventId}`;
          const record = registrations.get(key) || null;
          if (!record) return null;
          return {
            ...record,
            user: users.get(record.userId),
            event: events.get(record.eventId),
          };
        }
        if (where?.id) {
          for (const record of registrations.values()) {
            if (record.id === where.id) {
              return {
                ...record,
                user: users.get(record.userId),
                event: events.get(record.eventId),
              };
            }
          }
        }
        return null;
      },

      async findFirst({ where, orderBy, include }: any = {}) {
        let list = Array.from(registrations.values()).filter((r) => {
          if (where?.userId && r.userId !== where.userId) return false;
          if (where?.eventId && r.eventId !== where.eventId) return false;
          if (where?.status && r.status !== where.status) return false;
          return true;
        });
        if (orderBy && Array.isArray(orderBy)) {
          list.sort((a, b) => {
            for (const order of orderBy) {
              if (order.createdAt) {
                const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                if (diff !== 0) return order.createdAt === "desc" ? -diff : diff;
              }
              if (order.id) {
                const diff = String(a.id).localeCompare(String(b.id));
                if (diff !== 0) return order.id === "desc" ? -diff : diff;
              }
            }
            return 0;
          });
        }
        const first = list[0] || null;
        if (!first) return null;
        return {
          ...first,
          user: users.get(first.userId),
          event: events.get(first.eventId),
        };
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
          createdAt: data.createdAt || new Date(),
          updatedAt: data.updatedAt || new Date(),
          ...(include?.user ? { user: users.get(data.userId) } : {}),
          ...(include?.event ? { event: events.get(data.eventId) } : {}),
        };
        registrations.set(key, record);
        return record;
      },

      async update({ where, data, include }: any) {
        let targetKey = null;
        let target = null;
        if (where?.id) {
          for (const [k, v] of registrations.entries()) {
            if (v.id === where.id) {
              targetKey = k;
              target = v;
              break;
            }
          }
        } else if (where?.userId_eventId) {
          targetKey = `${where.userId_eventId.userId}_${where.userId_eventId.eventId}`;
          target = registrations.get(targetKey) || null;
        }
        if (!target || !targetKey) {
          throw new Error(`Record to update not found: ${JSON.stringify(where)}`);
        }
        const updated = {
          ...target,
          ...data,
          updatedAt: data.updatedAt || new Date(),
          ...(include?.user ? { user: users.get(target.userId) } : {}),
          ...(include?.event ? { event: events.get(target.eventId) } : {}),
        };
        registrations.set(targetKey, updated);
        return updated;
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

test("API: POST /api/events/[id]/register with waitlist: true joins waitlist when event is full", async () => {
  const req = new Request("http://localhost:3000/api/events/evt_full/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sessionCookieFor("u1") },
    body: JSON.stringify({ waitlist: true }),
  });

  const res = await registerEventRoutePost(req, { params: { id: "evt_full" } });
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.status, "waitlisted");
  assert.equal(data.waitlistPosition, 1);
  assert.equal(data.userId, "u1");
  assert.equal(data.eventId, "evt_full");
});

test("API: GET /api/events/[id]/register returns isWaitlisted and waitlistPosition for waitlisted user", async () => {
  // u1 joins waitlist
  await registerEventRoutePost(
    new Request("http://localhost:3000/api/events/evt_full/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sessionCookieFor("u1") },
      body: JSON.stringify({ waitlist: true }),
    }),
    { params: { id: "evt_full" } }
  );

  const reqGet = new Request("http://localhost:3000/api/events/evt_full/register", {
    method: "GET",
    headers: sessionCookieFor("u1"),
  });

  const resGet = await registerEventRouteGet(reqGet, { params: { id: "evt_full" } });
  assert.equal(resGet.status, 200);
  const dataGet = await resGet.json();
  assert.equal(dataGet.registered, true);
  assert.equal(dataGet.isWaitlisted, true);
  assert.equal(dataGet.waitlistPosition, 1);
  assert.equal(dataGet.registration.status, "waitlisted");
});

test("API: POST /api/events/[id]/waitlist explicitly joins waitlist when event is full", async () => {
  // First waitlist entry: u1
  await waitlistRoutePost(
    new Request("http://localhost:3000/api/events/evt_full/waitlist", {
      method: "POST",
      headers: sessionCookieFor("u1"),
    }),
    { params: { id: "evt_full" } }
  );

  // Second waitlist entry: u2
  const req2 = new Request("http://localhost:3000/api/events/evt_full/waitlist", {
    method: "POST",
    headers: sessionCookieFor("u2"),
  });
  const res2 = await waitlistRoutePost(req2, { params: { id: "evt_full" } });
  assert.equal(res2.status, 201);
  const data2 = await res2.json();
  assert.equal(data2.status, "waitlisted");
  assert.equal(data2.waitlistPosition, 2);
  assert.equal(data2.userId, "u2");
});

test("API: DELETE /api/events/[id]/register cancels registration and auto-promotes waitlisted user", async () => {
  // u1 joins waitlist on evt_full (capacity 1, u_seed confirmed)
  await registerEventRoutePost(
    new Request("http://localhost:3000/api/events/evt_full/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sessionCookieFor("u1") },
      body: JSON.stringify({ waitlist: true }),
    }),
    { params: { id: "evt_full" } }
  );

  const notifications: any[] = [];
  const unsubscribe = onWaitlistNotification((n) => { notifications.push(n); });

  try {
    // u_seed cancels registration
    const reqDel = new Request("http://localhost:3000/api/events/evt_full/register", {
      method: "DELETE",
      headers: sessionCookieFor("u_seed"),
    });

    const resDel = await registerEventRouteDelete(reqDel, { params: { id: "evt_full" } });
    assert.equal(resDel.status, 200);
    const dataDel = await resDel.json();

    assert.equal(dataDel.success, true);
    assert.equal(dataDel.registration.status, "cancelled");
    assert.ok(dataDel.promotedRegistration);
    assert.equal(dataDel.promotedRegistration.userId, "u1");
    assert.equal(dataDel.promotedRegistration.status, "confirmed");

    // Notification dispatched to u1
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].userId, "u1");
  } finally {
    unsubscribe();
  }
});

test("API: DELETE /api/registrations cancels registration and auto-promotes waitlisted user", async () => {
  // u1 joins waitlist
  await registerEventRoutePost(
    new Request("http://localhost:3000/api/events/evt_full/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sessionCookieFor("u1") },
      body: JSON.stringify({ waitlist: true }),
    }),
    { params: { id: "evt_full" } }
  );

  // u_seed cancels via /api/registrations?eventId=evt_full
  const reqDel = new Request("http://localhost:3000/api/registrations?eventId=evt_full", {
    method: "DELETE",
    headers: sessionCookieFor("u_seed"),
  });

  const resDel = await registrationsRouteDelete(reqDel);
  assert.equal(resDel.status, 200);
  const dataDel = await resDel.json();

  assert.equal(dataDel.success, true);
  assert.equal(dataDel.promotedRegistration.userId, "u1");
  assert.equal(dataDel.promotedRegistration.status, "confirmed");
});

test("API: POST /api/registrations with waitlist: true joins waitlist when event is full", async () => {
  const req = new Request("http://localhost:3000/api/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sessionCookieFor("u1") },
    body: JSON.stringify({ eventId: "evt_full", waitlist: true }),
  });

  const res = await registrationsRoutePost(req);
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.status, "waitlisted");
  assert.equal(data.waitlistPosition, 1);
});

test("API: POST /api/events/[id]/register sends confirmation notification to registered participant", async () => {
  const notifications: any[] = [];
  const unsubscribe = onNotification((n) => { notifications.push(n); });

  try {
    const req = new Request("http://localhost:3000/api/events/evt1/register", {
      method: "POST",
      headers: sessionCookieFor("u1"),
    });

    const res = await registerEventRoutePost(req, { params: { id: "evt1" } });
    assert.equal(res.status, 201);

    const confNotif = notifications.find(
      (n) => n.type === "REGISTRATION_CONFIRMATION" && n.userId === "u1"
    );
    assert.ok(confNotif, "Registration confirmation notification must be dispatched");
    assert.equal(confNotif.to, "amit.rao@test.com");
    assert.match(confNotif.subject, /Registration Confirmed: Tech Fest/);
  } finally {
    unsubscribe();
  }
});

test("API: DELETE /api/events/[id]/register sends cancellation notification to participant", async () => {
  // First register u2
  await registerEventRoutePost(
    new Request("http://localhost:3000/api/events/evt1/register", {
      method: "POST",
      headers: sessionCookieFor("u2"),
    }),
    { params: { id: "evt1" } }
  );

  const notifications: any[] = [];
  const unsubscribe = onNotification((n) => { notifications.push(n); });

  try {
    const reqDel = new Request("http://localhost:3000/api/events/evt1/register", {
      method: "DELETE",
      headers: sessionCookieFor("u2"),
    });

    const resDel = await registerEventRouteDelete(reqDel, { params: { id: "evt1" } });
    assert.equal(resDel.status, 200);

    const cancelNotif = notifications.find(
      (n) => n.type === "CANCELLATION_CONFIRMATION" && n.userId === "u2"
    );
    assert.ok(cancelNotif, "Cancellation notification must be dispatched to cancelling participant");
    assert.equal(cancelNotif.to, "priya.nair@test.com");
    assert.match(cancelNotif.subject, /Registration Cancelled: Tech Fest/);
  } finally {
    unsubscribe();
  }
});

test("API: DELETE /api/registrations sends cancellation notification to participant", async () => {
  // Register u1
  await registrationsRoutePost(
    new Request("http://localhost:3000/api/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sessionCookieFor("u1") },
      body: JSON.stringify({ eventId: "evt1" }),
    })
  );

  const notifications: any[] = [];
  const unsubscribe = onNotification((n) => { notifications.push(n); });

  try {
    const reqDel = new Request("http://localhost:3000/api/registrations?eventId=evt1", {
      method: "DELETE",
      headers: sessionCookieFor("u1"),
    });

    const resDel = await registrationsRouteDelete(reqDel);
    assert.equal(resDel.status, 200);

    const cancelNotif = notifications.find(
      (n) => n.type === "CANCELLATION_CONFIRMATION" && n.userId === "u1"
    );
    assert.ok(cancelNotif, "Cancellation notification must be dispatched via /api/registrations DELETE");
    assert.equal(cancelNotif.to, "amit.rao@test.com");
  } finally {
    unsubscribe();
  }
});

test("API: GET /api/registrations returns registrations list for current participant", async () => {
  // Register u1 for evt1
  await registrationsRoutePost(
    new Request("http://localhost:3000/api/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sessionCookieFor("u1") },
      body: JSON.stringify({ eventId: "evt1" }),
    })
  );

  const req = new Request("http://localhost:3000/api/registrations", {
    method: "GET",
    headers: sessionCookieFor("u1"),
  });

  const res = await registrationsRouteGet(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.registrations));
  assert.ok(data.registrations.some((r: any) => r.eventId === "evt1" && r.status === "confirmed"));
});

test("API: POST /api/reminders and GET /api/reminders processes upcoming event reminders", async () => {
  const baseTime = new Date("2026-10-28T10:00:00Z");
  const eventTime = new Date(baseTime.getTime() + 12 * 60 * 60 * 1000); // starts in 12 hours

  // Add event in window
  mockDb.events.set("evt_remind_api", {
    id: "evt_remind_api",
    name: "API Innovation Workshop",
    title: "API Innovation Workshop",
    date: eventTime,
    time: "10:00 PM",
    venue: "Lab A",
    category: "Tech",
    capacity: 20,
    status: EventStatus.ACTIVE,
    isCancelled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // u2 registers
  await registerEventRoutePost(
    new Request("http://localhost:3000/api/events/evt_remind_api/register", {
      method: "POST",
      headers: sessionCookieFor("u2"),
    }),
    { params: { id: "evt_remind_api" } }
  );

  const notifications: any[] = [];
  const unsubscribe = onNotification((n) => { notifications.push(n); });

  // Reminders fan out real email to every confirmed registrant, so the
  // route requires a cron secret or a privileged session — exercise that
  // real auth path rather than relying on NODE_ENV/missing-config fallbacks.
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-cron-secret";

  try {
    // Unauthenticated calls must be rejected.
    const unauthed = await remindersRoutePost(
      new Request("http://localhost:3000/api/reminders", { method: "POST" })
    );
    assert.equal(unauthed.status, 401);

    // 1. POST /api/reminders
    const reqPost = new Request("http://localhost:3000/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": "test-cron-secret" },
      body: JSON.stringify({ windowHours: 24, referenceDate: baseTime.toISOString() }),
    });

    const resPost = await remindersRoutePost(reqPost);
    assert.equal(resPost.status, 200);
    const dataPost = await resPost.json();
    assert.equal(dataPost.success, true);
    assert.ok(dataPost.remindersSent >= 1);

    const reminder = notifications.find(
      (n) => n.type === "EVENT_REMINDER" && n.userId === "u2" && n.eventId === "evt_remind_api"
    );
    assert.ok(reminder, "Reminder must be dispatched via POST /api/reminders");
    assert.equal(reminder.to, "priya.nair@test.com");

    // 2. GET /api/reminders
    const reqGet = new Request(
      `http://localhost:3000/api/reminders?windowHours=24&referenceDate=${encodeURIComponent(baseTime.toISOString())}`,
      { method: "GET", headers: { "x-cron-secret": "test-cron-secret" } }
    );
    const resGet = await remindersRouteGet(reqGet);
    assert.equal(resGet.status, 200);
    const dataGet = await resGet.json();
    assert.equal(dataGet.success, true);
  } finally {
    unsubscribe();
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FR-010a: Registration counts, seat availability, and participant export
// ─────────────────────────────────────────────────────────────────────────────

test("API: GET /api/events/[id]/export returns 401 when no session is present", async () => {
  const req = new Request("http://localhost:3000/api/events/evt1/export");
  const res = await exportRouteGet(req, { params: { id: "evt1" } });
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error, AUTH_REQUIRED_ERROR);
});

test("API: GET /api/events/[id]/export returns 404 when event not found", async () => {
  const req = new Request("http://localhost:3000/api/events/non_existent/export", {
    headers: { ...sessionCookieFor("u_org") },
  });
  const res = await exportRouteGet(req, { params: { id: "non_existent" } });
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.error, EVENT_NOT_FOUND_ERROR);
});

test("API: GET /api/events/[id]/export returns 403 when user is participant", async () => {
  const req = new Request("http://localhost:3000/api/events/evt1/export", {
    headers: { ...sessionCookieFor("u1") }, // u1 is a PARTICIPANT
  });
  const res = await exportRouteGet(req, { params: { id: "evt1" } });
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.match(data.error, /Access denied/);
});

test("API: GET /api/events/[id]/export returns 403 when user is a different organizer", async () => {
  const req = new Request("http://localhost:3000/api/events/evt1/export", {
    headers: { ...sessionCookieFor("u_org2") }, // u_org2 does NOT own evt1
  });
  const res = await exportRouteGet(req, { params: { id: "evt1" } });
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.match(data.error, /Access denied/);
});

test("API: GET /api/events/[id]/export?format=csv returns 200, CSV header, and participant rows for owner", async () => {
  // Pre-condition: Event has registrants
  mockDb.registrations.set("u1_evt1", {
    id: "reg_evt1_u1",
    userId: "u1",
    eventId: "evt1",
    status: RegistrationStatus.CONFIRMED,
    createdAt: new Date("2026-10-02T10:00:00Z"),
  });
  mockDb.registrations.set("u2_evt1", {
    id: "reg_evt1_u2",
    userId: "u2",
    eventId: "evt1",
    status: RegistrationStatus.CONFIRMED,
    createdAt: new Date("2026-10-02T11:00:00Z"),
  });

  const req = new Request("http://localhost:3000/api/events/evt1/export?format=csv", {
    headers: { ...sessionCookieFor("u_org") },
  });
  const res = await exportRouteGet(req, { params: { id: "evt1" } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Type") || "", /text\/csv/);
  assert.match(res.headers.get("Content-Disposition") || "", /attachment; filename="participants-tech-fest\.csv"/);

  const csvText = await res.text();
  assert.ok(csvText.includes("#,Name,Email,Status,Registration Date,Waitlist Position"));
  assert.ok(csvText.includes("Amit Rao"));
  assert.ok(csvText.includes("amit.rao@test.com"));
  assert.ok(csvText.includes("Priya Nair"));
  assert.ok(csvText.includes("priya.nair@test.com"));
});

test("API: GET /api/events/[id]/export?format=pdf returns 200 and valid PDF document for owner", async () => {
  mockDb.registrations.set("u1_evt1", {
    id: "reg_evt1_u1",
    userId: "u1",
    eventId: "evt1",
    status: RegistrationStatus.CONFIRMED,
    createdAt: new Date("2026-10-02T10:00:00Z"),
  });

  const req = new Request("http://localhost:3000/api/events/evt1/export?format=pdf", {
    headers: { ...sessionCookieFor("u_org") },
  });
  const res = await exportRouteGet(req, { params: { id: "evt1" } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "application/pdf");
  assert.match(res.headers.get("Content-Disposition") || "", /attachment; filename="participants-tech-fest\.pdf"/);

  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  const pdfString = buffer.toString("latin1");
  assert.ok(pdfString.startsWith("%PDF-1.4"));
  assert.ok(pdfString.includes("%%EOF"));
  assert.ok(pdfString.includes("Tech Fest"));
  assert.ok(pdfString.includes("Amit Rao"));
});

test("API: GET /api/events/[id]/export?format=json returns full report payload for owner", async () => {
  mockDb.registrations.set("u1_evt1", {
    id: "reg_evt1_u1",
    userId: "u1",
    eventId: "evt1",
    status: RegistrationStatus.CONFIRMED,
    createdAt: new Date("2026-10-02T10:00:00Z"),
  });

  const req = new Request("http://localhost:3000/api/events/evt1/export?format=json", {
    headers: { ...sessionCookieFor("u_org") },
  });
  const res = await exportRouteGet(req, { params: { id: "evt1" } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.event);
  assert.equal(data.confirmedCount, 1);
  assert.equal(data.availableSeats, 99);
  assert.equal(data.capacity, 100);
  assert.equal(data.participants.length, 1);
  assert.equal(data.participants[0].name, "Amit Rao");
});

test("API: GET /api/events/[id]/export allows admin to export participant list", async () => {
  const req = new Request("http://localhost:3000/api/events/evt1/export?format=csv", {
    headers: { ...sessionCookieFor("u_admin") }, // Admin role
  });
  const res = await exportRouteGet(req, { params: { id: "evt1" } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Type") || "", /text\/csv/);
});

test("API: GET /api/registrations?eventId=... returns 403 for non-owning organizer", async () => {
  const req = new Request("http://localhost:3000/api/registrations?eventId=evt1", {
    headers: { ...sessionCookieFor("u_org2") }, // Not the owner
  });
  const res = await registrationsRouteGet(req);
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.match(data.error, /Access denied/);
});

test("API: GET /api/registrations?eventId=... returns live database capacity totals for owner", async () => {
  mockDb.registrations.set("u1_evt1", {
    id: "reg_evt1_u1",
    userId: "u1",
    eventId: "evt1",
    status: RegistrationStatus.CONFIRMED,
    createdAt: new Date("2026-10-02T10:00:00Z"),
  });

  const req = new Request("http://localhost:3000/api/registrations?eventId=evt1", {
    headers: { ...sessionCookieFor("u_org") },
  });
  const res = await registrationsRouteGet(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.registrations));
  assert.equal(data.confirmedCount, 1);
  assert.equal(data.remainingSeats, 99);
  assert.equal(data.availableSeats, 99);
  assert.equal(data.capacity, 100);
  assert.equal(data.isFull, false);
});

test("API: GET /api/registrations?eventId=...&format=csv returns CSV export", async () => {
  mockDb.registrations.set("u1_evt1", {
    id: "reg_evt1_u1",
    userId: "u1",
    eventId: "evt1",
    status: RegistrationStatus.CONFIRMED,
    createdAt: new Date("2026-10-02T10:00:00Z"),
  });

  const req = new Request("http://localhost:3000/api/registrations?eventId=evt1&format=csv", {
    headers: { ...sessionCookieFor("u_org") },
  });
  const res = await registrationsRouteGet(req);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Type") || "", /text\/csv/);
  const text = await res.text();
  assert.ok(text.includes("Amit Rao"));
});

test("API: GET /api/registrations?eventId=...&format=pdf returns PDF export", async () => {
  mockDb.registrations.set("u1_evt1", {
    id: "reg_evt1_u1",
    userId: "u1",
    eventId: "evt1",
    status: RegistrationStatus.CONFIRMED,
    createdAt: new Date("2026-10-02T10:00:00Z"),
  });

  const req = new Request("http://localhost:3000/api/registrations?eventId=evt1&format=pdf", {
    headers: { ...sessionCookieFor("u_org") },
  });
  const res = await registrationsRouteGet(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "application/pdf");
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.toString("latin1").startsWith("%PDF-1.4"));
});
