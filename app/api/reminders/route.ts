import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getAuthUserFromRequest } from "@/lib/auth";
import { sendEventReminders } from "@/lib/registration";

// Triggering this fans out a real email to every confirmed registrant of
// every event in the window, so it must never be reachable without one of:
// a matching cron secret or a signed-in ADMIN/ORGANIZER session. Unlike the
// previous version, a missing CRON_SECRET env var (a deploy omission) no
// longer silently falls back to "allow everyone" — that fails closed
// instead, and tests exercise this same real check rather than a
// NODE_ENV-based bypass.
async function isAuthorized(request: Request): Promise<boolean> {
  const cronSecret = request.headers.get("x-cron-secret");
  if (process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET) {
    return true;
  }

  const sessionUser = await getAuthUserFromRequest(request);
  return Boolean(
    sessionUser && (sessionUser.role === Role.ADMIN || sessionUser.role === Role.ORGANIZER)
  );
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    // Body is optional
  }

  const windowHours = typeof body.windowHours === "number" ? body.windowHours : 24;
  const referenceDate = body.referenceDate ? new Date(body.referenceDate) : new Date();

  const result = await sendEventReminders({ windowHours, referenceDate });
  return NextResponse.json(result, { status: 200 });
}

export async function GET(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const windowHours = searchParams.get("windowHours")
    ? Number(searchParams.get("windowHours"))
    : 24;
  const refParam = searchParams.get("referenceDate");
  const referenceDate = refParam ? new Date(refParam) : new Date();

  const result = await sendEventReminders({ windowHours, referenceDate });
  return NextResponse.json(result, { status: 200 });
}
