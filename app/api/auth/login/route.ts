import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation";
import { sessionCookieHeader } from "@/lib/session";

const INVALID_CREDENTIALS = "Invalid email or password";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });

  // Same error for "no such user" and "wrong password" — don't let login
  // double as an account-existence oracle.
  if (!user) {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }

  if (user.suspended) {
    return NextResponse.json({ error: "This account has been suspended" }, { status: 403 });
  }

  if (!user.verified) {
    return NextResponse.json(
      { error: "Please verify your email before logging in" },
      { status: 403 }
    );
  }

  const response = NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
  response.headers.set("Set-Cookie", sessionCookieHeader(user.id));
  return response;
}
