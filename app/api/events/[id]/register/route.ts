import { NextResponse } from "next/server";
import { registerForEvent, checkUserRegistration, AUTH_REQUIRED_ERROR } from "@/lib/registration";
import { getAuthUserFromRequest, ensureDemoUserRow } from "@/lib/auth";

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  const eventId = context.params.id;

  try {
    const text = await request.text();
    if (text) JSON.parse(text);
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

  const result = await registerForEvent({ eventId, userId: sessionUser.id });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error, registration: result.registration },
      { status: result.statusCode }
    );
  }

  return NextResponse.json(result.registration, { status: result.statusCode });
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
