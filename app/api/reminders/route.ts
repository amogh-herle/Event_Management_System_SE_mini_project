import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getAuthUserFromRequest } from "@/lib/auth";
import { sendEventReminders } from "@/lib/registration";

export async function POST(request: Request) {
  const sessionUser = await getAuthUserFromRequest(request);
  const cronSecret = request.headers.get("x-cron-secret");
  const isAuthorizedCron =
    process.env.CRON_SECRET && cronSecret && cronSecret === process.env.CRON_SECRET;

  const isPrivilegedUser =
    sessionUser && (sessionUser.role === Role.ADMIN || sessionUser.role === Role.ORGANIZER);

  const isDevOrTest =
    process.env.NODE_ENV === "test" || (!process.env.CRON_SECRET && !sessionUser);

  if (!sessionUser && !isAuthorizedCron && !isDevOrTest) {
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
  const { searchParams } = new URL(request.url);
  const windowHours = searchParams.get("windowHours")
    ? Number(searchParams.get("windowHours"))
    : 24;
  const refParam = searchParams.get("referenceDate");
  const referenceDate = refParam ? new Date(refParam) : new Date();

  const result = await sendEventReminders({ windowHours, referenceDate });
  return NextResponse.json(result, { status: 200 });
}
