import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrganizer } from "@/lib/auth";
import { inMemoryEvents } from "@/app/api/events/store";

// ─────────────────────────────────────────────
// PATCH /api/events/[id]  — Cancel an event
//   Body: { action: "cancel" }
// ─────────────────────────────────────────────
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = requireOrganizer(request);
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
  } catch {
    // ── In-memory fallback ─────────────────────────────────────────────────
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
}

// ─────────────────────────────────────────────
// DELETE /api/events/[id]  — Hard-delete an event
// ─────────────────────────────────────────────
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = requireOrganizer(request);
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

    await prisma.event.delete({ where: { id } });

    // Mirror to in-memory store
    const idx = inMemoryEvents.findIndex((e) => e.id === id);
    if (idx !== -1) inMemoryEvents.splice(idx, 1);

    return new NextResponse(null, { status: 204 });
  } catch {
    // ── In-memory fallback ─────────────────────────────────────────────────
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
}
