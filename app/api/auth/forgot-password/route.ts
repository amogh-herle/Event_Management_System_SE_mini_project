import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validation";
import { createPasswordResetToken } from "@/lib/tokens";
import { sendMail } from "@/lib/mailer";
import { passwordResetEmail } from "@/lib/emailTemplates";
import { getPublicOrigin } from "@/lib/url";

const GENERIC_MESSAGE =
  "If that email is registered, a password reset link is on its way.";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { email } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  // Always return the same response whether or not the account exists —
  // same email-enumeration reasoning as signup's 409 and resend-verification.
  if (user) {
    try {
      const rawToken = await createPasswordResetToken(user.id);
      const resetUrl = `${getPublicOrigin(request)}/reset-password?token=${rawToken}`;
      const { subject, html } = passwordResetEmail(user.name, resetUrl);
      await sendMail(user.email, subject, html);
    } catch (mailErr) {
      // Don't fail the request over a transient mail-delivery issue — the
      // generic response doesn't reveal whether anything was actually sent.
      console.error("[forgot-password] failed to send email:", mailErr);
    }
  }

  return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
}
