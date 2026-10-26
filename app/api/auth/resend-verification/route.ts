import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createVerificationToken } from "@/lib/tokens";
import { sendMail } from "@/lib/mailer";
import { verificationEmail } from "@/lib/emailTemplates";
import { getPublicOrigin } from "@/lib/url";

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email() });

const GENERIC_MESSAGE =
  "If that email is registered and not yet verified, a new verification link is on its way.";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const { email } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  // Always return the same response whether or not the account exists —
  // same email-enumeration reasoning as the signup 409, applied here too.
  if (user && !user.verified) {
    try {
      const rawToken = await createVerificationToken(user.id);
      const verifyUrl = `${getPublicOrigin(request)}/verify?token=${rawToken}`;
      const { subject, html } = verificationEmail(user.name, verifyUrl);
      await sendMail(user.email, subject, html);
    } catch (mailErr) {
      console.error("[resend-verification] failed to send email:", mailErr);
    }
  }

  return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
}
