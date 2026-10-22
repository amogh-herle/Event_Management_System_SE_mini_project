import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h, matches the test plan's expiry window

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
