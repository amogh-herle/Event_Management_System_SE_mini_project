import { NextResponse } from "next/server";
import {
  joinWaitlist,
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

  const sessionUser = await getAuthUserFromRequest(request);
  if (!sessionUser) {
    return NextResponse.json({ error: AUTH_REQUIRED_ERROR }, { status: 401 });
  }

  await ensureDemoUserRow(sessionUser);

  const result = await joinWaitlist({ eventId, userId: sessionUser.id });

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
      waitlistPosition: result.waitlistPosition,
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
    return NextResponse.json({ error: result.error }, { status: result.statusCode });
  }

  return NextResponse.json({
    success: true,
    message: result.message ?? "Waitlist entry cancelled",
    registration: result.registration,
  });
}
