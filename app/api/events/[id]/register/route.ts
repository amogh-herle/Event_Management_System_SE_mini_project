import { NextResponse } from "next/server";
import { registerForEvent, checkUserRegistration } from "@/lib/registration";
import { getAuthUserFromRequest } from "@/lib/auth";

export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  const eventId = context.params.id;
  let body: any = {};

  try {
    const text = await request.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const sessionUser = await getAuthUserFromRequest(request);

  const userId =
    sessionUser?.id ||
    request.headers.get("x-user-id") ||
    body?.userId ||
    undefined;

  const userEmail =
    sessionUser?.email ||
    request.headers.get("x-user-email") ||
    body?.userEmail ||
    body?.email ||
    undefined;

  const result = await registerForEvent({
    eventId,
    userId,
    userEmail,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.statusCode });
  }

  return NextResponse.json(result.registration, { status: result.statusCode });
}

export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  const eventId = context.params.id;
  const { searchParams } = new URL(request.url);

  const sessionUser = await getAuthUserFromRequest(request);

  const userId =
    sessionUser?.id ||
    request.headers.get("x-user-id") ||
    searchParams.get("userId") ||
    undefined;

  if (!userId) {
    return NextResponse.json({ error: "User ID is required" }, { status: 400 });
  }

  const result = await checkUserRegistration(userId, eventId);
  return NextResponse.json(result);
}
