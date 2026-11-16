import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation";
import { sessionCookieHeader } from "@/lib/session";
import { logEvent } from "@/lib/auditLog";
import { ACCOUNT_LOCKED_ERROR, MAX_FAILED_LOGIN_ATTEMPTS, isLocked, nextFailureState } from "@/lib/loginLockout";

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

  if (isLocked(user.lockedUntil)) {
    return NextResponse.json({ error: ACCOUNT_LOCKED_ERROR }, { status: 423 });
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    const state = nextFailureState(user.failedLoginAttempts);
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: state.failedLoginAttempts, lockedUntil: state.lockedUntil },
    });
    if (state.locked) {
      await logEvent({
        severity: "WARN",
        action: "account.locked",
        actorId: user.id,
        actorRole: user.role,
        details: `Locked after ${MAX_FAILED_LOGIN_ATTEMPTS} consecutive failed login attempts`,
      });
      return NextResponse.json({ error: ACCOUNT_LOCKED_ERROR }, { status: 423 });
    }
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

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
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
