import test from "node:test";
import assert from "node:assert/strict";
import { GET as adminListGet, POST as adminCreatePost } from "../app/api/admin/categories/route";
import { PATCH as adminRenamePatch, DELETE as adminRemoveDelete } from "../app/api/admin/categories/[id]/route";
import * as publicCategoriesRoute from "../app/api/categories/route";
import { GET as eventsGet, POST as eventsPost } from "../app/api/events/route";
import { prisma } from "../lib/prisma";
import { Prisma, EventStatus, Role } from "@prisma/client";
import { createSessionValue } from "../lib/session";

process.env.SESSION_SECRET ||= "test-only-session-secret";

// FR-006c: admin adds, renames, and removes event categories.

function sessionCookieFor(userId: string) {
  return { Cookie: `session=${createSessionValue(userId)}` };
}

function matchesEventWhere(e: any, where: any = {}): boolean {
  if (where.OR) return where.OR.some((clause: any) => matchesEventWhere(e, clause));
  if (where.categoryId !== undefined && e.categoryId !== where.categoryId) return false;
  if (where.category !== undefined && e.category !== where.category) return false;
  if (where.organizerId && e.organizerId !== where.organizerId) return false;
  if (where.status && e.status !== where.status) return false;
  return true;
}

function createMockDb() {
  const users = new Map<string, any>();
  const categories = new Map<string, any>();
  const events = new Map<string, any>();
  const registrations = new Map<string, any>();
  let counter = 1;

  users.set("u_admin", { id: "u_admin", name: "Admin", email: "admin@test.com", role: Role.ADMIN, suspended: false });
  users.set("u_org", { id: "u_org", name: "Organizer", email: "org@test.com", role: Role.ORGANIZER, suspended: false });
  users.set("u1", { id: "u1", name: "Participant", email: "p@test.com", role: Role.PARTICIPANT, suspended: false });

  categories.set("cat_tech", { id: "cat_tech", name: "Technology", createdAt: new Date("2026-10-01") });
  categories.set("cat_music", { id: "cat_music", name: "Music", createdAt: new Date("2026-10-02") });
  categories.set("cat_unused", { id: "cat_unused", name: "Robotics", createdAt: new Date("2026-10-03") });

  const ev = (id: string, fields: Record<string, any>) =>
    events.set(id, {
      id,
      name: id,
      description: "d",
      date: new Date("2026-11-10T00:00:00Z"),
      time: "10:00 AM",
      venue: "Hall",
      capacity: 10,
      status: EventStatus.ACTIVE,
      organizerId: "u_org",
      createdAt: new Date("2026-10-05"),
      updatedAt: new Date("2026-10-05"),
      ...fields,
    });
  ev("evt_tech1", { category: "Technology", categoryId: "cat_tech" });
  ev("evt_tech2", { category: "Technology", categoryId: null }); // linked by name only
  ev("evt_tech_cancelled", { category: "Technology", categoryId: "cat_tech", status: EventStatus.CANCELLED });
  ev("evt_music", { category: "Music", categoryId: "cat_music" });

  registrations.set("reg1", { id: "reg1", userId: "u1", eventId: "evt_tech1", status: "CONFIRMED" });

  const db: any = {
    users,
    categories,
    events,
    registrations,

    user: {
      async findUnique({ where }: any) {
        return users.get(where.id) || null;
      },
      async upsert({ where, create }: any) {
        if (!users.has(where.id)) users.set(where.id, { ...create, suspended: false });
        return users.get(where.id);
      },
    },

    category: {
      async findMany({ orderBy }: any = {}) {
        const list = Array.from(categories.values());
        if (orderBy?.name === "asc") list.sort((a, b) => a.name.localeCompare(b.name));
        return list;
      },
      async findUnique({ where }: any) {
        return categories.get(where.id) || null;
      },
      async create({ data }: any) {
        for (const c of categories.values()) {
          if (c.name === data.name) {
            throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "5.22.0" });
          }
        }
        const created = { id: `cat_${counter++}`, name: data.name, createdAt: new Date() };
        categories.set(created.id, created);
        return created;
      },
      async upsert({ where, create }: any) {
        for (const c of categories.values()) if (c.name === where.name) return c;
        return db.category.create({ data: create });
      },
      async update({ where, data }: any) {
        const c = categories.get(where.id);
        if (!c) throw new Prisma.PrismaClientKnownRequestError("Not found", { code: "P2025", clientVersion: "5.22.0" });
        const updated = { ...c, ...data };
        categories.set(where.id, updated);
        return updated;
      },
      async delete({ where }: any) {
        const c = categories.get(where.id);
        if (!c) throw new Prisma.PrismaClientKnownRequestError("Not found", { code: "P2025", clientVersion: "5.22.0" });
        categories.delete(where.id);
        return c;
      },
    },

    event: {
      async count({ where }: any = {}) {
        return Array.from(events.values()).filter((e) => matchesEventWhere(e, where)).length;
      },
      async updateMany({ where, data }: any) {
        let count = 0;
        for (const [id, e] of events) {
          if (matchesEventWhere(e, where)) {
            events.set(id, { ...e, ...data, updatedAt: new Date() });
            count++;
          }
        }
        return { count };
      },
      async findMany({ where }: any = {}) {
        return Array.from(events.values())
          .filter((e) => matchesEventWhere(e, where))
          .map((e) => ({ ...e, organizer: users.get(e.organizerId) }));
      },
      async create({ data, include }: any) {
        const created = { id: `evt_${counter++}`, ...data, createdAt: new Date(), updatedAt: new Date() };
        events.set(created.id, created);
        return { ...created, ...(include?.organizer ? { organizer: users.get(created.organizerId) } : {}) };
      },
    },

    registration: {
      async groupBy() {
        return [];
      },
      async findMany() {
        return [];
      },
    },
  };
  return db;
}

let mockDb = createMockDb();

test.beforeEach(() => {
  mockDb = createMockDb();
  (prisma as any).user = mockDb.user;
  (prisma as any).category = mockDb.category;
  (prisma as any).event = mockDb.event;
  (prisma as any).registration = mockDb.registration;
  (prisma as any).$transaction = async (fn: any) => fn(prisma);
});

const admin = () => sessionCookieFor("u_admin");

function jsonRequest(method: string, path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const listRequest = (headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/admin/categories", { headers });

// ── View ─────────────────────────────────────────────────────────────────────

test("FR-006c: admin can view categories with how many events use each", async () => {
  const res = await adminListGet(listRequest(admin()));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(
    data.categories.map((c: any) => [c.name, c.eventCount]),
    [["Music", 1], ["Robotics", 0], ["Technology", 3]]
  );
  assert.ok(data.categories[0].id);
  assert.ok(data.categories[0].createdAt);
});

test("FR-006c: admin category list handles an empty list", async () => {
  mockDb.categories.clear();
  const res = await adminListGet(listRequest(admin()));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).categories, []);
});

// ── Add ──────────────────────────────────────────────────────────────────────

test("FR-006c: admin can add a category (trimmed)", async () => {
  const res = await adminCreatePost(jsonRequest("POST", "/api/admin/categories", { name: "  Gaming  " }, admin()));
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.category.name, "Gaming");
  assert.equal(data.category.eventCount, 0);
  assert.ok(Array.from(mockDb.categories.values()).some((c: any) => c.name === "Gaming"));
});

test("FR-006c: adding a duplicate category is rejected regardless of case", async () => {
  for (const name of ["Music", "music", "  MUSIC "]) {
    const res = await adminCreatePost(jsonRequest("POST", "/api/admin/categories", { name }, admin()));
    assert.equal(res.status, 409, name);
    assert.match((await res.json()).error, /already exists/);
  }
  assert.equal(mockDb.categories.size, 3);
});

test("FR-006c: names that differ only by LIKE wildcards are not treated as duplicates", async () => {
  // "Tech%" must not collide with "Technology"
  const res = await adminCreatePost(jsonRequest("POST", "/api/admin/categories", { name: "Tech%" }, admin()));
  assert.equal(res.status, 201);
});

test("FR-006c: invalid category names are rejected with 400", async () => {
  const cases: unknown[] = [{ name: "" }, { name: "   " }, { name: "x".repeat(101) }, {}, { name: 42 }];
  for (const body of cases) {
    const res = await adminCreatePost(jsonRequest("POST", "/api/admin/categories", body, admin()));
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  const malformed = await adminCreatePost(jsonRequest("POST", "/api/admin/categories", "{ nope", admin()));
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error, "Invalid request body");
  assert.equal(mockDb.categories.size, 3);
});

test("FR-006c: a unique-constraint race on add returns 409, not 500", async () => {
  mockDb.category.findMany = async () => []; // duplicate check misses the concurrent insert
  const res = await adminCreatePost(jsonRequest("POST", "/api/admin/categories", { name: "Music" }, admin()));
  assert.equal(res.status, 409);
});

// ── Rename ───────────────────────────────────────────────────────────────────

test("FR-006c: renaming a category updates every event using it, platform-wide", async () => {
  const res = await adminRenamePatch(
    jsonRequest("PATCH", "/api/admin/categories/cat_tech", { name: "Tech & Innovation" }, admin()),
    { params: { id: "cat_tech" } }
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.category.id, "cat_tech");
  assert.equal(data.category.name, "Tech & Innovation");
  assert.equal(data.category.eventCount, 3);

  // Same record renamed — no duplicate category created
  assert.equal(mockDb.categories.size, 3);
  for (const id of ["evt_tech1", "evt_tech2", "evt_tech_cancelled"]) {
    const e = mockDb.events.get(id);
    assert.equal(e.category, "Tech & Innovation", id);
    assert.equal(e.categoryId, "cat_tech", id);
  }
  // Other categories' events and registrations are untouched
  assert.equal(mockDb.events.get("evt_music").category, "Music");
  assert.equal(mockDb.registrations.size, 1);
  assert.equal(mockDb.events.get("evt_tech_cancelled").status, EventStatus.CANCELLED);
});

test("FR-006c: a rename shows up immediately in the event listing and public category list", async () => {
  await adminRenamePatch(
    jsonRequest("PATCH", "/api/admin/categories/cat_music", { name: "Live Music" }, admin()),
    { params: { id: "cat_music" } }
  );
  const listRes = await eventsGet(new Request("http://localhost:3000/api/events?active=true"));
  const listed = (await listRes.json()).events.find((e: any) => e.id === "evt_music");
  assert.equal(listed.category, "Live Music");

  const pub = await (await publicCategoriesRoute.GET()).json();
  assert.ok(pub.categories.includes("Live Music"));
  assert.ok(!pub.categories.includes("Music"));
});

test("FR-006c: renaming to another category's name is rejected; a case-only change is allowed", async () => {
  const dup = await adminRenamePatch(
    jsonRequest("PATCH", "/api/admin/categories/cat_tech", { name: "music" }, admin()),
    { params: { id: "cat_tech" } }
  );
  assert.equal(dup.status, 409);
  assert.equal(mockDb.categories.get("cat_tech").name, "Technology");
  assert.equal(mockDb.events.get("evt_tech1").category, "Technology");

  const caseOnly = await adminRenamePatch(
    jsonRequest("PATCH", "/api/admin/categories/cat_music", { name: "MUSIC" }, admin()),
    { params: { id: "cat_music" } }
  );
  assert.equal(caseOnly.status, 200);
  assert.equal(mockDb.events.get("evt_music").category, "MUSIC");
});

test("FR-006c: renaming with an invalid name or unknown id fails without changes", async () => {
  const invalid = await adminRenamePatch(
    jsonRequest("PATCH", "/api/admin/categories/cat_tech", { name: " " }, admin()),
    { params: { id: "cat_tech" } }
  );
  assert.equal(invalid.status, 400);
  const missing = await adminRenamePatch(
    jsonRequest("PATCH", "/api/admin/categories/nope", { name: "Anything" }, admin()),
    { params: { id: "nope" } }
  );
  assert.equal(missing.status, 404);
  assert.equal(mockDb.categories.get("cat_tech").name, "Technology");
});

// ── Remove ───────────────────────────────────────────────────────────────────

test("FR-006c: admin can remove a category no event uses", async () => {
  const res = await adminRemoveDelete(
    new Request("http://localhost:3000/api/admin/categories/cat_unused", { method: "DELETE", headers: admin() }),
    { params: { id: "cat_unused" } }
  );
  assert.equal(res.status, 204);
  assert.equal(mockDb.categories.has("cat_unused"), false);
  const pub = await (await publicCategoriesRoute.GET()).json();
  assert.ok(!pub.categories.includes("Robotics"));
});

test("FR-006c: a category used by events (even cancelled or name-only links) can't be removed", async () => {
  const res = await adminRemoveDelete(
    new Request("http://localhost:3000/api/admin/categories/cat_tech", { method: "DELETE", headers: admin() }),
    { params: { id: "cat_tech" } }
  );
  assert.equal(res.status, 409);
  const data = await res.json();
  assert.equal(data.eventCount, 3);
  assert.match(data.error, /used by 3 events/);
  assert.equal(mockDb.categories.has("cat_tech"), true);
  assert.equal(mockDb.events.size, 4);
  assert.equal(mockDb.registrations.size, 1);
});

test("FR-006c: removing an unknown category returns 404", async () => {
  const res = await adminRemoveDelete(
    new Request("http://localhost:3000/api/admin/categories/nope", { method: "DELETE", headers: admin() }),
    { params: { id: "nope" } }
  );
  assert.equal(res.status, 404);
});

// ── Authorization ────────────────────────────────────────────────────────────

test("FR-006c: non-admins can't view or change categories", async () => {
  const callers: Array<[string, Record<string, string>, number]> = [
    ["no session", {}, 401],
    ["participant", sessionCookieFor("u1"), 403],
    ["organizer", sessionCookieFor("u_org"), 403],
    // The demo role header is client-controlled and never grants admin
    ["demo ADMIN header", { "x-user-role": "ADMIN" }, 401],
    ["demo ADMIN cookie", { Cookie: "event_session_role=ADMIN" }, 401],
  ];
  for (const [label, headers, expected] of callers) {
    assert.equal((await adminListGet(listRequest(headers))).status, expected, `GET ${label}`);
    assert.equal(
      (await adminCreatePost(jsonRequest("POST", "/api/admin/categories", { name: "Hacked" }, headers))).status,
      expected,
      `POST ${label}`
    );
    assert.equal(
      (await adminRenamePatch(jsonRequest("PATCH", "/api/admin/categories/cat_tech", { name: "Hacked" }, headers), { params: { id: "cat_tech" } })).status,
      expected,
      `PATCH ${label}`
    );
    assert.equal(
      (await adminRemoveDelete(new Request("http://localhost:3000/api/admin/categories/cat_unused", { method: "DELETE", headers }), { params: { id: "cat_unused" } })).status,
      expected,
      `DELETE ${label}`
    );
  }
  assert.equal(mockDb.categories.size, 3);
  assert.equal(mockDb.categories.get("cat_tech").name, "Technology");
});

test("FR-006c: a suspended admin is treated as signed out", async () => {
  mockDb.users.get("u_admin").suspended = true;
  assert.equal((await adminListGet(listRequest(admin()))).status, 401);
});

// ── Failures ─────────────────────────────────────────────────────────────────

test("FR-006c: database failures return a generic 500 without internal details", async () => {
  const boom = async () => {
    throw new Error("connect ECONNREFUSED 10.0.0.5:5432 password=secret");
  };
  mockDb.category.findMany = boom;
  const list = await adminListGet(listRequest(admin()));
  assert.equal(list.status, 500);
  assert.equal((await list.json()).error, "Failed to load categories");

  mockDb.category.findUnique = boom;
  const rename = await adminRenamePatch(
    jsonRequest("PATCH", "/api/admin/categories/cat_tech", { name: "X" }, admin()),
    { params: { id: "cat_tech" } }
  );
  assert.equal(rename.status, 500);
  assert.equal((await rename.json()).error, "Failed to update category");

  const remove = await adminRemoveDelete(
    new Request("http://localhost:3000/api/admin/categories/cat_tech", { method: "DELETE", headers: admin() }),
    { params: { id: "cat_tech" } }
  );
  assert.equal(remove.status, 500);
  assert.equal((await remove.json()).error, "Failed to delete category");
});

// ── Integration with existing features ───────────────────────────────────────

test("FR-006c: the public category list is dynamic and reflects admin changes immediately", async () => {
  assert.equal(publicCategoriesRoute.dynamic, "force-dynamic");
  await adminCreatePost(jsonRequest("POST", "/api/admin/categories", { name: "Gaming" }, admin()));
  const pub = await (await publicCategoriesRoute.GET()).json();
  assert.deepEqual(pub.categories, ["Gaming", "Music", "Robotics", "Technology"]);
});

test("FR-006c: existing event creation still works and links to the managed category", async () => {
  const res = await eventsPost(
    jsonRequest(
      "POST",
      "/api/events",
      { name: "Band Night", description: "Live", date: "2026-12-01", time: "7:00 PM", venue: "Hall", category: "Music", capacity: 50 },
      sessionCookieFor("u_org")
    )
  );
  assert.equal(res.status, 201);
  const data = await res.json();
  const created = mockDb.events.get(data.event.id);
  assert.equal(created.category, "Music");
  assert.equal(created.categoryId, "cat_music");
  assert.equal(mockDb.categories.size, 3);
});
