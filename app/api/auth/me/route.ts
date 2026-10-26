import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSessionCookie, verifySessionValue } from "@/lib/session";

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
  const sessionValue = readSessionCookie(request);
  if (!sessionValue) {
    return NextResponse.json({ user: null });
  }

  const userId = verifySessionValue(sessionValue);
  if (!userId) {
    return NextResponse.json({ user: null });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.suspended) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}
