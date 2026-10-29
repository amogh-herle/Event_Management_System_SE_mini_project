import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthUserFromRequest } from "@/lib/auth";
import {
  getEventParticipantReport,
  exportParticipantsToCSV,
  exportParticipantsToPDF,
  AUTH_REQUIRED_ERROR,
  EVENT_NOT_FOUND_ERROR,
} from "@/lib/registration";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") || "csv").toLowerCase();

  // 1. Authentication Check (NFR-004)
  const sessionUser = await getAuthUserFromRequest(request);
  if (!sessionUser) {
    return NextResponse.json({ error: AUTH_REQUIRED_ERROR }, { status: 401 });
  }

  // 2. Fetch Event
  let event: any = null;
  try {
    event = await prisma.event.findUnique({
      where: { id },
      include: { organizer: { select: { id: true, name: true, email: true } } },
    });
  } catch (err) {
    // If DB offline, attempt fallback or return error
  }

  if (!event) {
    return NextResponse.json({ error: EVENT_NOT_FOUND_ERROR }, { status: 404 });
  }

  // 3. Role-Based Access Control (NFR-004)
  // Only the organizer who created the event or an admin can access registrant export
  const isOwner = sessionUser.id === event.organizerId;
  const isAdmin = sessionUser.role === Role.ADMIN || (sessionUser.role as string) === "ADMIN";

  if (!isOwner && !isAdmin) {
    return NextResponse.json(
      { error: "Access denied: Only the event organizer or an admin can export participant lists" },
      { status: 403 }
    );
  }

  // 4. Retrieve Participant Report & Live Database Counts (FR-010a)
  const report = await getEventParticipantReport(id, prisma);
  if (!report) {
    return NextResponse.json({ error: EVENT_NOT_FOUND_ERROR }, { status: 404 });
  }

  // Slugify event name for filename
  const safeTitle = (report.event.name || "event")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // 5. Generate Export Based on Requested Format
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

  if (format === "json") {
    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  // Default to CSV
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
