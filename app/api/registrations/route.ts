import { NextResponse } from "next/server";
import { registerEventSchema } from "@/lib/validation";
import { registerForEvent, listRegistrations } from "@/lib/registration";
import { getAuthUserFromRequest } from "@/lib/auth";

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

  const { eventId } = parsed.data;
  const sessionUser = await getAuthUserFromRequest(request);

  const userId =
    sessionUser?.id ||
    request.headers.get("x-user-id") ||
    parsed.data.userId ||
    undefined;

  const userEmail =
    sessionUser?.email ||
    request.headers.get("x-user-email") ||
    parsed.data.userEmail ||
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionUser = await getAuthUserFromRequest(request);

  const userId =
    sessionUser?.id ||
    request.headers.get("x-user-id") ||
    searchParams.get("userId") ||
    undefined;
  const eventId = searchParams.get("eventId") || undefined;

  if (!userId && !eventId) {
    return NextResponse.json(
      { error: "Either userId or eventId query parameter is required" },
      { status: 400 }
    );
  }

  const registrations = await listRegistrations({ userId, eventId });
  return NextResponse.json({ registrations });
}
