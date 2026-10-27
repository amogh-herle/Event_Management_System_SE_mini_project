import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const patchSchema = z.object({
  action: z.enum(["suspend", "unsuspend"]),
});

// PATCH /api/admin/users/[id] — FR-003c: admin suspends/unsuspends an account.
// A suspended account is blocked immediately: getAuthUserFromRequest /
// getRealSessionUser already treat a session for a suspended user as
// invalid (see lib/auth.ts), so this takes effect on that user's very next
// request — no separate "kill the session" step needed, sessions are
// stateless and re-check the User row every time.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (params.id === auth.user.id) {
    return NextResponse.json(
      { error: "You cannot suspend your own account" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: { suspended: parsed.data.action === "suspend" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      verified: true,
      suspended: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ user: updated });
}

// DELETE /api/admin/users/[id] — FR-003c: admin deletes an account.
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (params.id === auth.user.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Event.organizerId has no cascade — deleting an organizer who still has
  // events would hit the DB's FK constraint. Same conservative pattern as
  // DELETE /api/events/[id] blocking on existing registrations: tell the
  // admin what to do about it instead of surfacing a raw constraint error.
  const organizedEventCount = await prisma.event.count({
    where: { organizerId: params.id },
  });
  if (organizedEventCount > 0) {
    return NextResponse.json(
      {
        error:
          "Cannot delete this account — it still organizes events. Reassign or cancel those events first.",
      },
      { status: 409 }
    );
  }

  await prisma.user.delete({ where: { id: params.id } });

  return new NextResponse(null, { status: 204 });
}
