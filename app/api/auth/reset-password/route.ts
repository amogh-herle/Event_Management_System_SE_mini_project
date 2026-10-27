import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { resetPasswordSchema } from "@/lib/validation";
import { consumePasswordResetToken } from "@/lib/tokens";

// POST, not GET: a GET reset link is commonly pre-fetched by email-security
// scanners, which would silently burn the single-use token before the user
// ever clicks it — same reasoning as /api/auth/verify.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { token, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await consumePasswordResetToken(token, passwordHash);

  if (result.status === "success") {
    return NextResponse.json({ status: "success" }, { status: 200 });
  }

  const message =
    result.status === "expired"
      ? "This password reset link has expired."
      : "This password reset link is invalid or has already been used.";

  return NextResponse.json({ status: result.status, error: message }, { status: 400 });
}
