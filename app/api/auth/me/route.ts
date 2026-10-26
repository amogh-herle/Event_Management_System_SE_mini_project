import { NextResponse } from "next/server";
import { getRealSessionUser } from "@/lib/auth";

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
