import { NextResponse } from "next/server";
import {
  registerForEvent,
  cancelRegistration,
  checkUserRegistration,
  AUTH_REQUIRED_ERROR,
} from "@/lib/registration";
import { getAuthUserFromRequest, ensureDemoUserRow } from "@/lib/auth";

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  const eventId = context.params.id;

  let body: any = null;
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Identity must come from a verified session/demo-role claim, never from a
  // client-supplied header or body field — otherwise any caller could
  // register as an arbitrary other user.
  const sessionUser = await getAuthUserFromRequest(request);
  if (!sessionUser) {
    return NextResponse.json({ error: AUTH_REQUIRED_ERROR }, { status: 401 });
  }

  await ensureDemoUserRow(sessionUser);

  const waitlist = body?.waitlist === true;
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

export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  const eventId = context.params.id;

  const sessionUser = await getAuthUserFromRequest(request);
  if (!sessionUser) {
    return NextResponse.json({ error: AUTH_REQUIRED_ERROR }, { status: 401 });
  }

  const result = await checkUserRegistration(sessionUser.id, eventId);
  return NextResponse.json(result);
}

export async function DELETE(
  request: Request,
  context: { params: { id: string } }
) {
  const eventId = context.params.id;

  const sessionUser = await getAuthUserFromRequest(request);
  if (!sessionUser) {
    return NextResponse.json({ error: AUTH_REQUIRED_ERROR }, { status: 401 });
  }

  const result = await cancelRegistration({ eventId, userId: sessionUser.id });
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: result.statusCode }
    );
  }

  return NextResponse.json({
    success: true,
    message: result.message ?? "Registration cancelled",
    registration: result.registration,
    promotedRegistration: result.promotedRegistration,
    remainingSeats: result.remainingSeats,
  });
}
