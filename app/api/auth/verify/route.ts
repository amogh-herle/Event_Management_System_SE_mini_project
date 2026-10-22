import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeVerificationToken } from "@/lib/tokens";

const bodySchema = z.object({ token: z.string().min(1) });

// POST, not GET: a GET verification link is commonly pre-fetched by
// email-security scanners, which would silently burn the single-use
// token before the user ever clicks it. The /verify page loads via GET
// (harmless) and its client JS makes this POST on an actual click.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing or invalid token" }, { status: 400 });
  }

  const result = await consumeVerificationToken(parsed.data.token);

  if (result.status === "success") {
    return NextResponse.json({ status: "success" }, { status: 200 });
  }

  const message =
    result.status === "expired"
      ? "This verification link has expired."
      : "This verification link is invalid or has already been used.";

  return NextResponse.json({ status: result.status, error: message }, { status: 400 });
}
