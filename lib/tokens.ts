import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h, matches the test plan's expiry window

// Shorter than email verification — a reset link grants control over the
// account (set any password), so it should be live for less time than a
// link that only flips a verified flag.
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Creates a fresh verification token for a user, invalidating any
 * still-unused tokens from a previous signup/resend first so only one
 * link is ever valid at a time. Returns the raw token — only its hash
 * is stored, so this is the only place the raw value exists.
 */
export async function createVerificationToken(userId: string): Promise<string> {
  await prisma.verificationToken.deleteMany({
    where: { userId, usedAt: null },
  });

  const rawToken = crypto.randomBytes(32).toString("hex");

  await prisma.verificationToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  return rawToken;
}

export type VerifyTokenResult =
  | { status: "success" }
  | { status: "invalid" }
  | { status: "expired" };

export async function consumeVerificationToken(rawToken: string): Promise<VerifyTokenResult> {
  const tokenHash = hashToken(rawToken);

  const token = await prisma.verificationToken.findUnique({
    where: { tokenHash },
  });

  if (!token || token.usedAt) {
    return { status: "invalid" };
  }

  if (token.expiresAt < new Date()) {
    return { status: "expired" };
  }

  await prisma.$transaction([
    prisma.verificationToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: token.userId },
      data: { verified: true },
    }),
  ]);

  return { status: "success" };
}

/**
 * Creates a fresh password-reset token for a user, invalidating any
 * still-unused reset tokens first so only one link is ever valid at a
 * time (requesting a new one silently supersedes an older unused link).
 */
export async function createPasswordResetToken(userId: string): Promise<string> {
  await prisma.passwordResetToken.deleteMany({
    where: { userId, usedAt: null },
  });

  const rawToken = crypto.randomBytes(32).toString("hex");

  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  return rawToken;
}

/**
 * Validates a reset token and, if valid, atomically marks it used and
 * updates the user's password hash. Does NOT touch any outstanding
 * session cookie for this user — sessions here are stateless (signed
 * userId + expiry only, see lib/session.ts), so an existing session stays
 * valid for the rest of its 7-day life even after a password reset. That
 * matches this app's session design, not a gap specific to reset.
 */
export async function consumePasswordResetToken(
  rawToken: string,
  newPasswordHash: string
): Promise<VerifyTokenResult> {
  const tokenHash = hashToken(rawToken);

  const token = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!token || token.usedAt) {
    return { status: "invalid" };
  }

  if (token.expiresAt < new Date()) {
    return { status: "expired" };
  }

  await prisma.$transaction([
    prisma.passwordResetToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: token.userId },
      data: { passwordHash: newPasswordHash },
    }),
  ]);

  return { status: "success" };
}
