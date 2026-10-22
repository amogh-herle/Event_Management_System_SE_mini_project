import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { signupSchema } from "@/lib/validation";

const DUPLICATE_EMAIL_ERROR = "An account with this email already exists";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: DUPLICATE_EMAIL_ERROR }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const user = await prisma.user.create({
      data: { name, email, passwordHash },
      // verified defaults to false — activation happens in FR-001b (email verification)
    });

    return NextResponse.json(
      { id: user.id, name: user.name, email: user.email, verified: user.verified },
      { status: 201 }
    );
  } catch (err) {
    // Two concurrent signups can both pass the findUnique check above;
    // the DB-level unique constraint on email is the real guard.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: DUPLICATE_EMAIL_ERROR }, { status: 409 });
    }
    throw err;
  }
}
