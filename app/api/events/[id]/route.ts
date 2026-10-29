import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrganizer } from "@/lib/auth";
import { createEventSchema } from "@/lib/validation";
import { StoredEvent, inMemoryEvents } from "@/app/api/events/store";
import { getEventCapacity, updateEventDetails } from "@/lib/registration";

// ─────────────────────────────────────────────
// GET /api/events/[id]  — Fetch a single event
// ─────────────────────────────────────────────
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const event = await prisma.event.findUnique({
      where: { id },
      include: { organizer: { select: { id: true, name: true, email: true } } },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    let capacityInfo = null;
    try {
      capacityInfo = await getEventCapacity(event.id);
    } catch {
      // Fallback if table uninitialized
    }

    const capacity = typeof event.capacity === "number" ? event.capacity : 0;
    const confirmedCount = capacityInfo ? capacityInfo.confirmedCount : 0;
    const remainingSeats = capacityInfo ? capacityInfo.remainingSeats : capacity;
    const availableSeats = remainingSeats;
    const waitlistCount = capacityInfo ? capacityInfo.waitlistCount : 0;
    const isFull = capacityInfo ? capacityInfo.isFull : remainingSeats <= 0;

    return NextResponse.json({
      event: {
        id: event.id,
        name: event.name,
        description: event.description,
        date: event.date.toISOString().slice(0, 10),
        time: event.time,
        venue: event.venue,
        category: event.category,
        capacity,
        status: event.status,
        organizerId: event.organizerId,
        organizerName: event.organizer.name,
        createdAt: event.createdAt.toISOString(),
        updatedAt: event.updatedAt.toISOString(),
        confirmedCount,
        registeredCount: confirmedCount,
        remainingSeats,
        availableSeats,
        waitlistCount,
        isFull,
      },
    });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientInitializationError)) {
      console.error("[events/:id] failed to fetch event:", err);
      return NextResponse.json({ error: "Failed to load event" }, { status: 500 });
    }

    const found = inMemoryEvents.find((e) => e.id === id);
    if (!found) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    return NextResponse.json({ event: found });
  }
}

// ─────────────────────────────────────────────
// PATCH /api/events/[id]  — Cancel an event
//   Body: { action: "cancel" }
// ─────────────────────────────────────────────
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireOrganizer(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error ?? "Access denied" },
      { status: auth.status ?? 403 }
    );
  }

  const { id } = params;

  let body: { action?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (body.action !== "cancel") {
    return NextResponse.json(
      { error: "Unknown action. Supported: cancel" },
      { status: 400 }
    );
  }

  // ── Database path ──────────────────────────────────────────────────────────
  try {
    const event = await prisma.event.findUnique({ where: { id } });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Only the owning organizer may cancel (AC: FR-005a ownership guard)
    if (event.organizerId !== auth.user.id) {
      return NextResponse.json(
        { error: "Forbidden: you are not the organizer of this event" },
        { status: 403 }
      );
    }

    if (event.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Event is already cancelled" },
        { status: 409 }
      );
    }

    const updated = await prisma.event.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: { organizer: { select: { id: true, name: true, email: true } } },
    });

    // Mirror to in-memory store
    const idx = inMemoryEvents.findIndex((e) => e.id === id);
    if (idx !== -1) inMemoryEvents[idx].status = "CANCELLED";

    return NextResponse.json({
      event: {
        id: updated.id,
        name: updated.name,
        status: updated.status,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    // Only degrade to the in-memory store for a genuinely unreachable
    // database — not for every error, which would otherwise mean a real
    // failure gets silently redirected to stale seed data (or reports
    // "not found" for an event that actually exists and wasn't touched).
    if (err instanceof Prisma.PrismaClientInitializationError) {
      const idx = inMemoryEvents.findIndex((e) => e.id === id);
      if (idx === -1) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 });
      }

      if (inMemoryEvents[idx].organizerId !== auth.user.id) {
        return NextResponse.json(
          { error: "Forbidden: you are not the organizer of this event" },
          { status: 403 }
        );
      }

      if (inMemoryEvents[idx].status === "CANCELLED") {
        return NextResponse.json(
          { error: "Event is already cancelled" },
          { status: 409 }
        );
      }

      inMemoryEvents[idx].status = "CANCELLED";
      inMemoryEvents[idx].updatedAt = new Date().toISOString();

      return NextResponse.json({
        event: {
          id: inMemoryEvents[idx].id,
          name: inMemoryEvents[idx].name,
          status: inMemoryEvents[idx].status,
          updatedAt: inMemoryEvents[idx].updatedAt,
        },
      });
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    console.error("[events/:id] failed to cancel event:", err);
    return NextResponse.json({ error: "Failed to cancel event" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// PUT /api/events/[id]  — Edit event details (FR-004b)
//   Body: { name, description, date, time, venue, category, capacity }
//   Same fields and validation as creation (FR-004a). Updates the existing
//   Event row in place — registrations are never touched.
// ─────────────────────────────────────────────
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireOrganizer(request);
  if (!auth.authorized) {
    return NextResponse.json(
      {
        error:
          auth.status === 403
            ? "Access denied: Only organizers can edit events"
            : auth.error ?? "Access denied",
      },
      { status: auth.status ?? 403 }
    );
  }

  const { id } = params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

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
  const expectedUpdatedAt =
    typeof (body as any)?.updatedAt === "string" ? (body as any).updatedAt : undefined;

  // ── Database path ──────────────────────────────────────────────────────────
  try {
    const result = await updateEventDetails({
      eventId: id,
      organizerId: auth.user.id,
      data: { name, description, date, time, venue, category, capacity },
      expectedUpdatedAt,
    });

    if (!result.success || !result.event) {
      return NextResponse.json(
        { error: result.error, errors: result.errors },
        { status: result.statusCode }
      );
    }

    const updated = result.event;
    const formatted: StoredEvent = {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      date: updated.date.toISOString().slice(0, 10),
      time: updated.time,
      venue: updated.venue,
      category: updated.category,
      capacity: updated.capacity,
      status: updated.status as StoredEvent["status"],
      organizerId: updated.organizerId,
      organizerName: updated.organizerName,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };

    // Mirror to in-memory store, used only once the DB path below throws
    // PrismaClientInitializationError on a later request.
    const idx = inMemoryEvents.findIndex((e) => e.id === id);
    if (idx !== -1) inMemoryEvents[idx] = { ...inMemoryEvents[idx], ...formatted };

    return NextResponse.json({
      event: formatted,
      ...(result.promotedCount ? { promotedCount: result.promotedCount } : {}),
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientInitializationError) {
      const idx = inMemoryEvents.findIndex((e) => e.id === id);
      if (idx === -1) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 });
      }

      if (inMemoryEvents[idx].organizerId !== auth.user.id) {
        return NextResponse.json(
          { error: "Forbidden: you are not the organizer of this event" },
          { status: 403 }
        );
      }

      if (inMemoryEvents[idx].status === "CANCELLED") {
        return NextResponse.json(
          { error: "Cancelled events cannot be edited" },
          { status: 409 }
        );
      }

      // Unlike the DB path, this fallback cannot reject a capacity drop
      // below confirmed registrations — the in-memory store has no
      // Registration table to count against (see store.ts), the same
      // documented limitation every other capacity-aware field on
      // StoredEvent already carries in this degraded mode.

      inMemoryEvents[idx] = {
        ...inMemoryEvents[idx],
        name,
        description,
        date,
        time,
        venue,
        category,
        capacity,
        updatedAt: new Date().toISOString(),
      };

      return NextResponse.json({ event: inMemoryEvents[idx] });
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    console.error("[events/:id] failed to update event:", err);
    return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// DELETE /api/events/[id]  — Hard-delete an event
// ─────────────────────────────────────────────
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireOrganizer(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error ?? "Access denied" },
      { status: auth.status ?? 403 }
    );
  }

  const { id } = params;

  // ── Database path ──────────────────────────────────────────────────────────
  try {
    const event = await prisma.event.findUnique({ where: { id } });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (event.organizerId !== auth.user.id) {
      return NextResponse.json(
        { error: "Forbidden: you are not the organizer of this event" },
        { status: 403 }
      );
    }

    const registrationCount = await prisma.registration.count({ where: { eventId: id } });
    if (registrationCount > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete an event with existing registrations. Cancel it instead so participants are notified.",
        },
        { status: 409 }
      );
    }

    await prisma.event.delete({ where: { id } });

    // Mirror to in-memory store
    const idx = inMemoryEvents.findIndex((e) => e.id === id);
    if (idx !== -1) inMemoryEvents.splice(idx, 1);

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientInitializationError) {
      const idx = inMemoryEvents.findIndex((e) => e.id === id);
      if (idx === -1) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 });
      }

      if (inMemoryEvents[idx].organizerId !== auth.user.id) {
        return NextResponse.json(
          { error: "Forbidden: you are not the organizer of this event" },
          { status: 403 }
        );
      }

      inMemoryEvents.splice(idx, 1);
      return new NextResponse(null, { status: 204 });
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    console.error("[events/:id] failed to delete event:", err);
    return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
  }
}
