import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createEventSchema } from "@/lib/validation";
import { getAuthUserFromRequest, requireOrganizer } from "@/lib/auth";
import { StoredEvent, inMemoryEvents } from "@/app/api/events/store";

export type { StoredEvent };

export async function POST(request: Request) {
  // 1. Role-based Access Control (NFR-004, ST_02)
  const auth = requireOrganizer(request);
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
    // Ensure organizer user exists in database
    await prisma.user.upsert({
      where: { id: auth.user.id },
      update: { role: auth.user.role },
      create: {
        id: auth.user.id,
        name: auth.user.name,
        email: auth.user.email,
        passwordHash: "demo-password-hash",
        role: auth.user.role,
        verified: true,
      },
    });

    // Optional category relation
    let categoryId: string | undefined;
    try {
      const cat = await prisma.category.upsert({
        where: { name: category },
        update: {},
        create: { name: category },
      });
      categoryId = cat.id;
    } catch {
      // ignore category table if not yet migrated
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

    inMemoryEvents.unshift(formatted);

    return NextResponse.json({ event: formatted }, { status: 201 });
  } catch {
    // Graceful fallback to memory store if DB is disconnected/unreachable
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
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const organizerFilter = searchParams.get("organizer");
  // FR-006a: "active" param — when "true" only return ACTIVE events (excludes CANCELLED)
  const activeOnly = searchParams.get("active") === "true";
  const auth = getAuthUserFromRequest(request);

  try {
    const whereClause: { organizerId?: string; status?: "ACTIVE" } = {};
    if (organizerFilter === "me") {
      whereClause.organizerId = auth.id;
    } else if (organizerFilter) {
      whereClause.organizerId = organizerFilter;
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

    const mapped: StoredEvent[] = events.map((e) => ({
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
    }));

    return NextResponse.json({ events: mapped });
  } catch {
    // In-memory fallback
    let list = [...inMemoryEvents];
    if (organizerFilter === "me") {
      list = list.filter((e) => e.organizerId === auth.id);
    } else if (organizerFilter) {
      list = list.filter((e) => e.organizerId === organizerFilter);
    }
    if (activeOnly) {
      list = list.filter((e) => e.status === "ACTIVE");
    }
    return NextResponse.json({ events: list });
  }
}
