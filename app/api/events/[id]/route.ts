import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrganizer } from "@/lib/auth";
import { inMemoryEvents } from "@/app/api/events/store";
import { getEventCapacity } from "@/lib/registration";

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
