import test from "node:test";
import assert from "node:assert/strict";
import { GET as statsRouteGet } from "../app/api/admin/stats/route";
import { GET as statisticsRouteGet } from "../app/api/admin/statistics/route";
import {
  getPlatformStats,
  setCachedPlatformStats,
  getCachedPlatformStats,
} from "../lib/stats";
import { prisma } from "../lib/prisma";
import { EventStatus, RegistrationStatus, Role } from "@prisma/client";
import { createSessionValue } from "../lib/session";

process.env.SESSION_SECRET ||= "test-only-session-secret";

function sessionCookieFor(userId: string) {
  return { Cookie: `session=${createSessionValue(userId)}` };
}

function createMockDb() {
  const users = new Map<string, any>();
  const events = new Map<string, any>();
  const registrations = new Map<string, any>();

  // Default Seed Users
  users.set("admin_1", {
    id: "admin_1",
    name: "Admin Alice",
    email: "admin@platform.test",
    role: Role.ADMIN,
    verified: true,
    suspended: false,
    createdAt: new Date("2026-01-01T10:00:00Z"),
  });

  users.set("admin_suspended", {
    id: "admin_suspended",
    name: "Suspended Admin",
    email: "suspended_admin@platform.test",
    role: Role.ADMIN,
    verified: true,
    suspended: true,
    createdAt: new Date("2026-01-02T10:00:00Z"),
  });

  users.set("org_1", {
    id: "org_1",
    name: "Organizer Bob",
    email: "bob@campus.test",
    role: Role.ORGANIZER,
    verified: true,
    suspended: false,
    createdAt: new Date("2026-01-05T10:00:00Z"),
  });

  users.set("part_1", {
    id: "part_1",
    name: "Student Charlie",
    email: "charlie@student.test",
    role: Role.PARTICIPANT,
    verified: true,
    suspended: false,
    createdAt: new Date("2026-01-10T10:00:00Z"),
  });

  users.set("part_unverified", {
    id: "part_unverified",
    name: "Student Dan",
    email: "dan@student.test",
    role: Role.PARTICIPANT,
    verified: false,
    suspended: false,
    createdAt: new Date("2026-01-12T10:00:00Z"),
  });

  // Default Seed Events
  events.set("evt_tech", {
    id: "evt_tech",
    name: "Tech Symposium 2026",
    category: "Technology",
    capacity: 100,
    status: EventStatus.ACTIVE,
    date: new Date("2026-11-15T09:00:00Z"),
    createdAt: new Date("2026-01-15T10:00:00Z"),
  });

  events.set("evt_workshop", {
    id: "evt_workshop",
    name: "AI Hands-on Workshop",
    category: "Workshop",
    capacity: 50,
    status: EventStatus.ACTIVE,
    date: new Date("2026-11-20T14:00:00Z"),
    createdAt: new Date("2026-01-20T10:00:00Z"),
  });

  events.set("evt_cancelled", {
    id: "evt_cancelled",
    name: "Cancelled Cultural Night",
    category: "Culture",
    capacity: 200,
    status: EventStatus.CANCELLED,
    date: new Date("2026-12-01T18:00:00Z"),
    createdAt: new Date("2026-02-01T10:00:00Z"),
  });

  events.set("evt_past", {
    id: "evt_past",
    name: "Past Hackathon",
    category: "Technology",
    capacity: 80,
    status: EventStatus.ACTIVE,
    date: new Date("2026-01-01T10:00:00Z"), // past
    createdAt: new Date("2025-12-01T10:00:00Z"),
  });

  // Default Seed Registrations
  registrations.set("reg_1", {
    id: "reg_1",
    userId: "part_1",
    eventId: "evt_tech",
    status: RegistrationStatus.CONFIRMED,
    createdAt: new Date("2026-01-16T10:00:00Z"),
  });

  registrations.set("reg_2", {
    id: "reg_2",
    userId: "part_unverified",
    eventId: "evt_tech",
    status: RegistrationStatus.WAITLISTED,
    createdAt: new Date("2026-01-17T10:00:00Z"),
  });

  registrations.set("reg_3", {
    id: "reg_3",
    userId: "part_1",
    eventId: "evt_workshop",
    status: RegistrationStatus.CANCELLED,
    createdAt: new Date("2026-01-21T10:00:00Z"),
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
      async count({ where }: any = {}) {
        return Array.from(users.values()).filter((u) => {
          if (where?.role && u.role !== where.role) return false;
          if (where?.verified !== undefined && u.verified !== where.verified) return false;
          if (where?.suspended !== undefined && u.suspended !== where.suspended) return false;
          if (where?.createdAt?.gte && new Date(u.createdAt).getTime() < new Date(where.createdAt.gte).getTime()) {
            return false;
          }
          if (where?.createdAt?.lte && new Date(u.createdAt).getTime() > new Date(where.createdAt.lte).getTime()) {
            return false;
          }
          return true;
        }).length;
      },
      async findMany({ where }: any = {}) {
        return Array.from(users.values()).filter((u) => {
          if (where?.role && u.role !== where.role) return false;
          if (where?.suspended !== undefined && u.suspended !== where.suspended) return false;
          return true;
        });
      },
    },

    event: {
      async findUnique({ where }: any) {
        return events.get(where.id) || null;
      },
      async count({ where }: any = {}) {
        return Array.from(events.values()).filter((e) => {
          if (where?.status && e.status !== where.status) return false;
          if (where?.category && e.category !== where.category) return false;
          if (where?.createdAt?.gte && new Date(e.createdAt || e.date).getTime() < new Date(where.createdAt.gte).getTime()) {
            return false;
          }
          if (where?.createdAt?.lte && new Date(e.createdAt || e.date).getTime() > new Date(where.createdAt.lte).getTime()) {
            return false;
          }
          return true;
        }).length;
      },
      async findMany({ where }: any = {}) {
        return Array.from(events.values()).filter((e) => {
          if (where?.status && e.status !== where.status) return false;
          if (where?.category && e.category !== where.category) return false;
          if (where?.createdAt?.gte && new Date(e.createdAt || e.date).getTime() < new Date(where.createdAt.gte).getTime()) {
            return false;
          }
          if (where?.createdAt?.lte && new Date(e.createdAt || e.date).getTime() > new Date(where.createdAt.lte).getTime()) {
            return false;
          }
          return true;
        });
      },
    },

    registration: {
      async count({ where }: any = {}) {
        return Array.from(registrations.values()).filter((r) => {
          if (where?.userId && r.userId !== where.userId) return false;
          if (where?.eventId && r.eventId !== where.eventId) return false;
          if (where?.status && r.status !== where.status) return false;
          if (where?.createdAt?.gte && new Date(r.createdAt).getTime() < new Date(where.createdAt.gte).getTime()) {
            return false;
          }
          if (where?.createdAt?.lte && new Date(r.createdAt).getTime() > new Date(where.createdAt.lte).getTime()) {
            return false;
          }
          if (where?.event?.category) {
            const ev = events.get(r.eventId);
            if (!ev || ev.category !== where.event.category) return false;
          }
          return true;
        }).length;
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
  (prisma as any).$transaction = async (fn: any) => fn(prisma);
  setCachedPlatformStats(null);
});

// ---------------------------------------------------------------------------
// Unit Tests (lib/stats.ts)
// ---------------------------------------------------------------------------

test("FR-010b / UT_01: getPlatformStats computes live database totals accurately", async () => {
  const stats = await getPlatformStats({
    client: prisma,
    now: new Date("2026-06-01T00:00:00Z"),
  });

  // Top-level totals matching Acceptance Criteria
  assert.equal(stats.totalEvents, 4, "Total events should be 4");
  assert.equal(stats.totalUsers, 5, "Total users should be 5");
  assert.equal(stats.totalRegistrations, 3, "Total registrations should be 3");

  // Events breakdown
  assert.equal(stats.events.total, 4);
  assert.equal(stats.events.active, 3);
  assert.equal(stats.events.cancelled, 1);
  assert.equal(stats.events.upcoming, 2); // evt_tech (Nov), evt_workshop (Nov)
  assert.equal(stats.events.past, 1); // evt_past (Jan 2026)

  // Users breakdown
  assert.equal(stats.users.total, 5);
  assert.equal(stats.users.admins, 2);
  assert.equal(stats.users.organizers, 1);
  assert.equal(stats.users.participants, 2);
  assert.equal(stats.users.verified, 4);
  assert.equal(stats.users.suspended, 1);

  // Registrations breakdown
  assert.equal(stats.registrations.total, 3);
  assert.equal(stats.registrations.confirmed, 1);
  assert.equal(stats.registrations.waitlisted, 1);
  assert.equal(stats.registrations.cancelled, 1);

  // Capacity calculation (active events: 100 + 50 + 80 = 230)
  assert.equal(stats.capacity.totalCapacity, 230);
  assert.equal(stats.capacity.confirmedRegistrations, 1);
  // 1 / 230 = 0.434% -> 0.4%
  assert.equal(stats.capacity.utilizationRate, 0.4);

  // Category breakdown
  const techCat = stats.events.byCategory.find((c) => c.category === "Technology");
  assert.ok(techCat);
  assert.equal(techCat?.count, 2);
});

test("FR-010b / UT_02: Date range and category filtering with graceful zero activity (UC-17 Step 3a)", async () => {
  // Query for a date range in 2024 (zero activity)
  const emptyStats = await getPlatformStats({
    client: prisma,
    startDate: "2024-01-01",
    endDate: "2024-12-31",
    now: new Date("2026-06-01T00:00:00Z"),
  });

  // Must display zeros rather than throwing an error (UC-17 Alternate Flow 3a)
  assert.equal(emptyStats.totalEvents, 0);
  assert.equal(emptyStats.totalUsers, 0);
  assert.equal(emptyStats.totalRegistrations, 0);
  assert.equal(emptyStats.events.active, 0);
  assert.equal(emptyStats.users.participants, 0);
  assert.equal(emptyStats.registrations.confirmed, 0);
  assert.equal(emptyStats.capacity.totalCapacity, 0);
  assert.equal(emptyStats.capacity.utilizationRate, 0);

  // Filter for category: "Technology"
  const techStats = await getPlatformStats({
    client: prisma,
    category: "Technology",
    now: new Date("2026-06-01T00:00:00Z"),
  });
  assert.equal(techStats.totalEvents, 2);
});

test("FR-010b / UT_03: Rejects inverted date ranges and malformed dates", async () => {
  await assert.rejects(
    async () => {
      await getPlatformStats({
        client: prisma,
        startDate: "2026-12-31",
        endDate: "2026-01-01",
      });
    },
    { message: /startDate must be before or equal to endDate/ }
  );

  await assert.rejects(
    async () => {
      await getPlatformStats({
        client: prisma,
        startDate: "not-a-date",
      });
    },
    { message: /Invalid startDate format/ }
  );
});

test("FR-010b / UT_04: Fallback to cached snapshot on aggregation failure (UC-17 Step 2a)", async () => {
  // Prime the cache with an initial successful run
  const initial = await getPlatformStats({ client: prisma });
  assert.equal(initial.cached, false);
  assert.ok(getCachedPlatformStats());

  // Simulate a database failure
  const failingClient = {
    event: {
      count: async () => {
        throw new Error("Simulated database timeout under heavy load");
      },
      findMany: async () => {
        throw new Error("Simulated database timeout under heavy load");
      },
    },
    user: {
      count: async () => {
        throw new Error("Simulated database timeout under heavy load");
      },
    },
    registration: {
      count: async () => {
        throw new Error("Simulated database timeout under heavy load");
      },
    },
  };

  const fallback = await getPlatformStats({ client: failingClient });
  assert.equal(fallback.cached, true, "Must fall back to cached snapshot");
  assert.equal(fallback.totalEvents, initial.totalEvents);
  assert.equal(fallback.totalUsers, initial.totalUsers);
  assert.equal(fallback.asOf, initial.asOf);
});

// ---------------------------------------------------------------------------
// Route & Security / RBAC Tests (GET /api/admin/stats)
// ---------------------------------------------------------------------------

test("FR-010b / IT_01: GET /api/admin/stats returns 200 with live platform stats for ADMIN session", async () => {
  const req = new Request("http://localhost:3000/api/admin/stats", {
    method: "GET",
    headers: sessionCookieFor("admin_1"),
  });

  const res = await statsRouteGet(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store, no-cache, must-revalidate");

  const data = await res.json();
  assert.equal(data.totalEvents, 4);
  assert.equal(data.totalUsers, 5);
  assert.equal(data.totalRegistrations, 3);
  assert.ok(data.events && typeof data.events.active === "number");
  assert.ok(data.users && typeof data.users.admins === "number");
  assert.ok(data.registrations && typeof data.registrations.confirmed === "number");
  assert.ok(data.asOf && typeof data.asOf === "string");
});

test("FR-010b / IT_02: RBAC enforcement — non-admin roles and unauthenticated callers are rejected", async () => {
  // 1. Unauthenticated (no session cookie) -> 401
  const reqUnauth = new Request("http://localhost:3000/api/admin/stats", { method: "GET" });
  const resUnauth = await statsRouteGet(reqUnauth);
  assert.equal(resUnauth.status, 401);
  const dataUnauth = await resUnauth.json();
  assert.equal(dataUnauth.error, "Authentication required");

  // 2. Participant role -> 403
  const reqPart = new Request("http://localhost:3000/api/admin/stats", {
    method: "GET",
    headers: sessionCookieFor("part_1"),
  });
  const resPart = await statsRouteGet(reqPart);
  assert.equal(resPart.status, 403);
  const dataPart = await resPart.json();
  assert.equal(dataPart.error, "Access denied: Admins only");

  // 3. Organizer role -> 403
  const reqOrg = new Request("http://localhost:3000/api/admin/stats", {
    method: "GET",
    headers: sessionCookieFor("org_1"),
  });
  const resOrg = await statsRouteGet(reqOrg);
  assert.equal(resOrg.status, 403);
  const dataOrg = await resOrg.json();
  assert.equal(dataOrg.error, "Access denied: Admins only");

  // 4. Suspended Admin account -> 401 (treated as logged out immediately per FR-003a)
  const reqSuspended = new Request("http://localhost:3000/api/admin/stats", {
    method: "GET",
    headers: sessionCookieFor("admin_suspended"),
  });
  const resSuspended = await statsRouteGet(reqSuspended);
  assert.equal(resSuspended.status, 401);
});

test("FR-010b / IT_03: Query parameters validation on GET /api/admin/stats", async () => {
  // Valid date filter
  const reqFilter = new Request(
    "http://localhost:3000/api/admin/stats?startDate=2026-01-01&endDate=2026-01-31&category=Technology",
    {
      method: "GET",
      headers: sessionCookieFor("admin_1"),
    }
  );
  const resFilter = await statsRouteGet(reqFilter);
  assert.equal(resFilter.status, 200);
  const dataFilter = await resFilter.json();
  assert.ok(dataFilter.filter);
  assert.equal(dataFilter.filter.category, "Technology");

  // Inverted date range -> 400
  const reqInverted = new Request(
    "http://localhost:3000/api/admin/stats?startDate=2026-12-31&endDate=2026-01-01",
    {
      method: "GET",
      headers: sessionCookieFor("admin_1"),
    }
  );
  const resInverted = await statsRouteGet(reqInverted);
  assert.equal(resInverted.status, 400);
  const dataInverted = await resInverted.json();
  assert.match(dataInverted.error, /startDate must be before/);
});

test("FR-010b / IT_04: Alias endpoint GET /api/admin/statistics behaves identically", async () => {
  const req = new Request("http://localhost:3000/api/admin/statistics", {
    method: "GET",
    headers: sessionCookieFor("admin_1"),
  });

  const res = await statisticsRouteGet(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.totalEvents, 4);
  assert.equal(data.totalUsers, 5);
  assert.equal(data.totalRegistrations, 3);
});

// ---------------------------------------------------------------------------
// System Test (Documents/TEST-CASE_DOCUMENT.pdf FR-010 ST_01)
// ---------------------------------------------------------------------------

test("FR-010b / ST_01: Platform Statistics shows exact database totals for 50 events, 300 users, 900 registrations", async () => {
  // Clear out default mockDb and seed exact numbers per ST_01 test data
  mockDb.events.clear();
  mockDb.users.clear();
  mockDb.registrations.clear();

  // Admin user
  mockDb.users.set("admin_test", {
    id: "admin_test",
    name: "Platform Administrator",
    email: "sysadmin@campus.edu",
    role: Role.ADMIN,
    verified: true,
    suspended: false,
    createdAt: new Date(),
  });

  // Seed 300 users (including admin_test)
  for (let i = 1; i < 300; i++) {
    const role = i <= 50 ? Role.ORGANIZER : Role.PARTICIPANT;
    mockDb.users.set(`user_${i}`, {
      id: `user_${i}`,
      name: `User ${i}`,
      email: `user${i}@campus.edu`,
      role,
      verified: true,
      suspended: false,
      createdAt: new Date(),
    });
  }
  assert.equal(mockDb.users.size, 300, "Database should contain exactly 300 users");

  // Seed 50 events (45 active, 5 cancelled)
  for (let i = 1; i <= 50; i++) {
    const isCancelled = i > 45;
    mockDb.events.set(`event_${i}`, {
      id: `event_${i}`,
      name: `Campus Event ${i}`,
      category: i % 2 === 0 ? "Academic" : "Sports",
      capacity: 50,
      status: isCancelled ? EventStatus.CANCELLED : EventStatus.ACTIVE,
      date: new Date("2026-11-01"),
      createdAt: new Date(),
    });
  }
  assert.equal(mockDb.events.size, 50, "Database should contain exactly 50 events");

  // Seed 900 registrations (800 confirmed, 50 waitlisted, 50 cancelled)
  for (let i = 1; i <= 900; i++) {
    const status =
      i <= 800
        ? RegistrationStatus.CONFIRMED
        : i <= 850
        ? RegistrationStatus.WAITLISTED
        : RegistrationStatus.CANCELLED;
    mockDb.registrations.set(`reg_${i}`, {
      id: `reg_${i}`,
      userId: `user_${(i % 290) + 1}`,
      eventId: `event_${(i % 45) + 1}`,
      status,
      createdAt: new Date(),
    });
  }
  assert.equal(mockDb.registrations.size, 900, "Database should contain exactly 900 registrations");

  // Step 1: Admin opens the Platform Statistics page / queries GET /api/admin/stats
  const req = new Request("http://localhost:3000/api/admin/stats", {
    method: "GET",
    headers: sessionCookieFor("admin_test"),
  });
  const res = await statsRouteGet(req);
  assert.equal(res.status, 200);

  const stats = await res.json();

  // Expected Results: Displayed totals exactly match the known database counts
  assert.equal(stats.totalEvents, 50, "totalEvents must exactly equal 50");
  assert.equal(stats.totalUsers, 300, "totalUsers must exactly equal 300");
  assert.equal(stats.totalRegistrations, 900, "totalRegistrations must exactly equal 900");
  assert.equal(stats.events.active, 45);
  assert.equal(stats.events.cancelled, 5);
  assert.equal(stats.registrations.confirmed, 800);
  assert.equal(stats.registrations.waitlisted, 50);
  assert.equal(stats.registrations.cancelled, 50);

  // Live Mutation Verification: Add 1 event, 1 user, 1 registration
  mockDb.events.set("event_new", {
    id: "event_new",
    name: "Brand New Summit",
    category: "Academic",
    capacity: 200,
    status: EventStatus.ACTIVE,
    date: new Date("2026-12-10"),
    createdAt: new Date(),
  });

  mockDb.users.set("user_new", {
    id: "user_new",
    name: "New Student",
    email: "newstudent@campus.edu",
    role: Role.PARTICIPANT,
    verified: true,
    suspended: false,
    createdAt: new Date(),
  });

  mockDb.registrations.set("reg_new", {
    id: "reg_new",
    userId: "user_new",
    eventId: "event_new",
    status: RegistrationStatus.CONFIRMED,
    createdAt: new Date(),
  });

  // Re-fetch statistics: totals must reflect mutations live
  const resAfterMutation = await statsRouteGet(req);
  const statsAfterMutation = await resAfterMutation.json();

  assert.equal(statsAfterMutation.totalEvents, 51, "totalEvents must reflect live update to 51");
  assert.equal(statsAfterMutation.totalUsers, 301, "totalUsers must reflect live update to 301");
  assert.equal(statsAfterMutation.totalRegistrations, 901, "totalRegistrations must reflect live update to 901");
  assert.equal(statsAfterMutation.events.active, 46);
  assert.equal(statsAfterMutation.registrations.confirmed, 801);
});
