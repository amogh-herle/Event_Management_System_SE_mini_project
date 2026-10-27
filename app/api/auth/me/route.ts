import { NextResponse } from "next/server";
import { getRealSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateProfileSchema } from "@/lib/validation";

/**
 * Returns the real logged-in user (FR-002a session), or `{ user: null }` if
 * there isn't one. Deliberately ignores the demo x-user-role/
 * event_session_role claim that lib/auth.ts's getAuthUserFromRequest falls
 * back to — the whole point of this endpoint is to let the client tell a
 * real account apart from "nobody's logged in, just the demo RoleSwitcher
 * cookie is set", which getAuthUserFromRequest's merged AuthUser shape
 * can't distinguish.
 */
export async function GET(request: Request) {
  const user = await getRealSessionUser(request);
  return NextResponse.json({ user });
}

/**
 * FR-003b: update the logged-in account's own profile. Only `name` is
 * editable here — email is the login identity (changing it has
 * re-verification implications out of scope for this FR) and password
 * changes already go through FR-002a's login flow / FR-002b's reset flow.
 */
export async function PATCH(request: Request) {
  const sessionUser = await getRealSessionUser(request);
  if (!sessionUser) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const updated = await prisma.user.update({
    where: { id: sessionUser.id },
    data: { name: parsed.data.name },
  });

  return NextResponse.json({
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
    },
  });
}
