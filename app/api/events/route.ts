import { NextResponse } from "next/server";
import { Prisma, RegistrationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createEventSchema } from "@/lib/validation";
import { getAuthUserFromRequest, requireOrganizer, ensureDemoUserRow } from "@/lib/auth";
import { StoredEvent, inMemoryEvents } from "@/app/api/events/store";

export type { StoredEvent };

export async function POST(request: Request) {
  // 1. Role-based Access Control (NFR-004, ST_02)
  const auth = await requireOrganizer(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error ?? "Access denied: Only organizers can create events" },
      { status: auth.status ?? 403 }
    );
  }

  // 2. Parse request JSON body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // 3. Validate event input schema (UT_01, UT_02, IT_02)
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Invalid event details";
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string") {
        fieldErrors[field] = issue.message;
      }
    }
    return NextResponse.json(
      { error: firstIssue, errors: fieldErrors },
      { status: 400 }
    );
  }

  const { name, description, date, time, venue, category, capacity } = parsed.data;

  // 4. Persist event
  try {
    await ensureDemoUserRow(auth.user);

    // Optional category relation — losing this link isn't fatal to event
    // creation, but only swallow the specific "table not migrated yet"
    // case; any other error (e.g. a genuine unique-constraint race) gets
    // logged instead of silently disappearing.
    let categoryId: string | undefined;
    try {
      const cat = await prisma.category.upsert({
        where: { name: category },
        update: {},
        create: { name: category },
      });
      categoryId = cat.id;
    } catch (catErr) {
      if (!(catErr instanceof Prisma.PrismaClientKnownRequestError && catErr.code === "P2021")) {
        console.error("[events] category upsert failed, continuing without category link:", catErr);
      }
    }

    const eventDate = new Date(date);

    const created = await prisma.event.create({
      data: {
        name,
        description,
        date: eventDate,
        time,
        venue,
        category,
        categoryId: categoryId ?? null,
        capacity,
        status: "ACTIVE",
        organizerId: auth.user.id,
      },
      include: {
        organizer: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    const formatted: StoredEvent = {
      id: created.id,
      name: created.name,
      description: created.description,
      date: created.date.toISOString().slice(0, 10),
      time: created.time,
      venue: created.venue,
      category: created.category,
      capacity: created.capacity,
      status: created.status,
      organizerId: created.organizerId,
      organizerName: created.organizer.name,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };

    return NextResponse.json({ event: formatted }, { status: 201 });
  } catch (dbErr) {
    // Only degrade to the in-memory store when the database is genuinely
    // unreachable (connection/init failure) — not for every error. A real
    // data error (bad constraint, overflow, etc.) must surface as a real
    // error response, not a fake 201 that silently isn't persisted.
    if (dbErr instanceof Prisma.PrismaClientInitializationError) {
      const fallbackEvent: StoredEvent = {
        id: "evt-" + Math.random().toString(36).substring(2, 9),
        name,
        description,
        date,
        time,
        venue,
        category,
        capacity,
        status: "ACTIVE",
        organizerId: auth.user.id,
        organizerName: auth.user.name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      inMemoryEvents.unshift(fallbackEvent);
      return NextResponse.json({ event: fallbackEvent }, { status: 201 });
    }

    console.error("[events] failed to create event:", dbErr);
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const organizerFilter = searchParams.get("organizer");
  // FR-006a: "active" param — when "true" only return ACTIVE events (excludes CANCELLED)
  const activeOnly = searchParams.get("active") === "true";
  const auth = await getAuthUserFromRequest(request);

  if (organizerFilter === "me" && !auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // "me" (resolved server-side from auth) or no filter (public browse) are
  // the only supported options. An arbitrary organizer id was previously
  // accepted here too, letting anyone enumerate any other organizer's full
  // event list by id with zero authorization.
  try {
    const whereClause: { organizerId?: string; status?: "ACTIVE" } = {};
    if (organizerFilter === "me" && auth) {
      whereClause.organizerId = auth.id;
    }
    // FR-006a: exclude CANCELLED events from public listing
    if (activeOnly) {
      whereClause.status = "ACTIVE";
    }

    const events = await prisma.event.findMany({
      where: whereClause,
      include: {
        organizer: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Batched (not per-event) so listing N events costs 1-2 extra queries
    // total, not N — confirmed-seat counts for the capacity display (FR-008)
    // and, when the caller is authenticated, which of these events they're
    // already registered for (so the directory doesn't always start every
    // card at "Register" regardless of real status).
    const eventIds = events.map((e) => e.id);
    const confirmedCounts = eventIds.length
      ? await prisma.registration.groupBy({
          by: ["eventId"],
          where: { eventId: { in: eventIds }, status: RegistrationStatus.CONFIRMED },
          _count: { _all: true },
        })
      : [];
    const confirmedCountByEvent = new Map(confirmedCounts.map((c) => [c.eventId, c._count._all]));

    let registeredEventIds: Set<string> | null = null;
    if (auth && eventIds.length) {
      const myRegs = await prisma.registration.findMany({
        where: { userId: auth.id, eventId: { in: eventIds }, status: RegistrationStatus.CONFIRMED },
        select: { eventId: true },
      });
      registeredEventIds = new Set(myRegs.map((r) => r.eventId));
    }

    const mapped: StoredEvent[] = events.map((e) => {
      const confirmedCount = confirmedCountByEvent.get(e.id) ?? 0;
      const remainingSeats = Math.max(0, e.capacity - confirmedCount);
      return {
        id: e.id,
        name: e.name,
        description: e.description,
        date: e.date.toISOString().slice(0, 10),
        time: e.time,
        venue: e.venue,
        category: e.category,
        capacity: e.capacity,
        status: e.status,
        organizerId: e.organizerId,
        organizerName: e.organizer.name,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
        remainingSeats,
        isFull: remainingSeats <= 0,
        registered: registeredEventIds ? registeredEventIds.has(e.id) : undefined,
      };
    });

    return NextResponse.json({ events: mapped });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientInitializationError)) {
      console.error("[events] failed to list events:", err);
      return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
    }

    // Database genuinely unreachable — serve the in-memory fallback.
    let list = [...inMemoryEvents];
    if (organizerFilter === "me" && auth) {
      list = list.filter((e) => e.organizerId === auth.id);
    }
    if (activeOnly) {
      list = list.filter((e) => e.status === "ACTIVE");
    }
    return NextResponse.json({ events: list });
  }
}
