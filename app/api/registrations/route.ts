import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { registerEventSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  registerForEvent,
  cancelRegistration,
  listRegistrations,
  getEventCapacity,
  getEventParticipantReport,
  exportParticipantsToCSV,
  exportParticipantsToPDF,
  AUTH_REQUIRED_ERROR,
} from "@/lib/registration";
import { getAuthUserFromRequest, ensureDemoUserRow } from "@/lib/auth";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = registerEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  // Identity must come from a verified session/demo-role claim, never from a
  // client-supplied header or body field — otherwise any caller could
  // register as an arbitrary other user.
  const sessionUser = await getAuthUserFromRequest(request);
  if (!sessionUser) {
    return NextResponse.json({ error: AUTH_REQUIRED_ERROR }, { status: 401 });
  }

  await ensureDemoUserRow(sessionUser);

  const { eventId, waitlist } = parsed.data;
  const result = await registerForEvent({ eventId, userId: sessionUser.id, waitlist });

  if (!result.success) {
    return NextResponse.json(
      {
        error: result.error,
        registration: result.registration,
        waitlistPosition: result.waitlistPosition,
      },
      { status: result.statusCode }
    );
  }

  return NextResponse.json(
    {
      ...result.registration,
      waitlistPosition: result.waitlistPosition ?? result.registration?.waitlistPosition,
    },
    { status: result.statusCode }
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const sessionUser = await getAuthUserFromRequest(request);
  if (!sessionUser) {
    return NextResponse.json({ error: AUTH_REQUIRED_ERROR }, { status: 401 });
  }

  const eventId = searchParams.get("eventId") || undefined;
  const status = searchParams.get("status") || undefined;
  const format = searchParams.get("format")?.toLowerCase();

  // Organizers/admins may list every registration for an event they're
  // looking up (the attendee roster); everyone else can only ever see their
  // own registrations — a caller-supplied userId is never trusted.
  const isPrivileged = sessionUser.role === Role.ORGANIZER || sessionUser.role === Role.ADMIN;

  if (eventId && sessionUser.role === Role.ORGANIZER) {
    try {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, organizerId: true },
      });
      if (event && event.organizerId !== sessionUser.id) {
        return NextResponse.json(
          { error: "Access denied: You are not the organizer of this event" },
          { status: 403 }
        );
      }
    } catch {
      // In-memory or offline DB fallback
    }
  }

  const userId = isPrivileged && eventId ? undefined : sessionUser.id;

  if (!userId && !eventId) {
    return NextResponse.json(
      { error: "eventId query parameter is required" },
      { status: 400 }
    );
  }

  if (eventId && (format === "csv" || format === "pdf")) {
    const report = await getEventParticipantReport(eventId, prisma);
    if (!report) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const safeTitle = (report.event.name || "event")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    if (format === "pdf") {
      const pdfBuffer = exportParticipantsToPDF(report.participants, report.event);
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="participants-${safeTitle}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const csvString = exportParticipantsToCSV(report.participants, report.event);
    return new NextResponse(csvString, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="participants-${safeTitle}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const registrations = await listRegistrations({ userId, eventId, status });
  let capacityInfo = null;
  if (eventId) {
    try {
      capacityInfo = await getEventCapacity(eventId, prisma);
    } catch {}
  }

  return NextResponse.json({
    registrations,
    ...(capacityInfo ? {
      capacity: capacityInfo.capacity,
      confirmedCount: capacityInfo.confirmedCount,
      remainingSeats: capacityInfo.remainingSeats,
      availableSeats: capacityInfo.availableSeats,
      waitlistCount: capacityInfo.waitlistCount,
      isFull: capacityInfo.isFull,
    } : {}),
  });
}

export async function DELETE(request: Request) {
  const sessionUser = await getAuthUserFromRequest(request);
  if (!sessionUser) {
    return NextResponse.json({ error: AUTH_REQUIRED_ERROR }, { status: 401 });
  }

  let eventId: string | undefined;
  const { searchParams } = new URL(request.url);
  eventId = searchParams.get("eventId") || undefined;

  if (!eventId) {
    try {
      const body = await request.json();
      if (body?.eventId && typeof body.eventId === "string") {
        eventId = body.eventId;
      }
    } catch {
      // Ignored if body is empty or not JSON
    }
  }

  if (!eventId) {
    return NextResponse.json({ error: "eventId parameter is required" }, { status: 400 });
  }

  const result = await cancelRegistration({ eventId, userId: sessionUser.id });
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.statusCode });
  }

  return NextResponse.json({
    success: true,
    message: result.message ?? "Registration cancelled",
    registration: result.registration,
    promotedRegistration: result.promotedRegistration,
    remainingSeats: result.remainingSeats,
  });
}
