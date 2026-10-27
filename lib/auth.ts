import { cookies, headers } from "next/headers";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifySessionValue } from "@/lib/session";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export const DEMO_ORGANIZER: AuthUser = {
  id: "organizer-demo-id",
  name: "Campus Organizer",
  email: "organizer@campus.edu",
  role: Role.ORGANIZER,
};

export const DEMO_PARTICIPANT: AuthUser = {
  id: "participant-demo-id",
  name: "Student Participant",
  email: "participant@campus.edu",
  role: Role.PARTICIPANT,
};

export const DEMO_ADMIN: AuthUser = {
  id: "admin-demo-id",
  name: "Platform Administrator",
  email: "admin@campus.edu",
  role: Role.ADMIN,
};

function readCookie(request: Request | undefined, name: string): string | null {
  if (request) {
    const cookieHeader = request.headers.get("cookie") || "";
    const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : null;
  }
  try {
    return cookies().get(name)?.value || null;
  } catch {
    return null;
  }
}

function readRoleHeader(request: Request | undefined): string | null {
  if (request) return request.headers.get("x-user-role");
  try {
    return headers().get("x-user-role");
  } catch {
    return null;
  }
}

/**
 * Resolves the caller's identity: a real session (FR-002a login) takes
 * priority when present; the demo x-user-role header / event_session_role
 * cookie (predates real login, still used by the RoleSwitcher UI for
 * quick role-testing) is a fallback for when there's no session at all.
 *
 * A session for a suspended/deleted account returns null directly — no
 * falling back to the demo claim — so suspension takes effect on the very
 * next request (FR-003a). An expired or missing session falls through to
 * the demo claim, same as before real login existed.
 */
export async function getAuthUserFromRequest(request?: Request): Promise<AuthUser | null> {
  const sessionValue = readCookie(request, "session");
  if (sessionValue) {
    const userId = verifySessionValue(sessionValue);
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.suspended) {
        return null;
      }
      return { id: user.id, name: user.name, email: user.email, role: user.role };
    }
    // Signature invalid or expired — not an attack signal, just "not
    // logged in"; fall through to the demo claim below.
  }

  const roleHeader = readRoleHeader(request);
  const cookieRole = readCookie(request, "event_session_role");
  const claim = (roleHeader || cookieRole)?.toUpperCase();
  if (!claim) {
    return null;
  }

  if (claim === "PARTICIPANT") {
    return DEMO_PARTICIPANT;
  }
  if (claim === "ADMIN") {
    return DEMO_ADMIN;
  }
  if (claim === "ORGANIZER") {
    return DEMO_ORGANIZER;
  }
  return null;
}

/**
 * Resolves a real logged-in account only — unlike getAuthUserFromRequest,
 * never falls back to the demo x-user-role claim. Used wherever the caller
 * needs to tell "a real account is logged in" apart from "nobody's logged
 * in, the demo RoleSwitcher cookie just happens to say Organizer" (e.g.
 * whether to show a Log out button, or a real account's fixed role instead
 * of a switchable demo one).
 */
export async function getRealSessionUser(request?: Request): Promise<AuthUser | null> {
  const sessionValue = readCookie(request, "session");
  if (!sessionValue) return null;

  const userId = verifySessionValue(sessionValue);
  if (!userId) return null;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.suspended) return null;

  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

/**
 * Ensures a User row exists for the given identity, creating it (with a
 * placeholder password hash) on first use. Needed because the demo
 * x-user-role claim resolves to a fixed AuthUser object (DEMO_ORGANIZER /
 * DEMO_PARTICIPANT / DEMO_ADMIN) that doesn't automatically have a backing
 * database row — any write that foreign-keys off userId (creating an
 * event, registering for one) needs that row to exist first. Only sets
 * role/fields on first creation; a real logged-in user's row is left
 * untouched (`update: {}`), since role here is otherwise client-controlled
 * for the demo case and would silently stomp real data on every call.
 */
export async function ensureDemoUserRow(user: AuthUser): Promise<void> {
  await prisma.user.upsert({
    where: { id: user.id },
    update: {},
    create: {
      id: user.id,
      name: user.name,
      email: user.email,
      passwordHash: "demo-password-hash",
      role: user.role,
      verified: true,
    },
  });
}

type AuthResult =
  | { authorized: true; user: AuthUser }
  | { authorized: false; user: AuthUser | null; error: string; status: number };

export async function requireOrganizer(request?: Request): Promise<AuthResult> {
  const user = await getAuthUserFromRequest(request);

  if (!user) {
    return {
      authorized: false,
      user: null,
      error: "Authentication required",
      status: 401,
    };
  }

  if (user.role !== Role.ORGANIZER && user.role !== Role.ADMIN) {
    return {
      authorized: false,
      user,
      error: "Access denied: Only organizers can create events",
      status: 403,
    };
  }

  return { authorized: true, user };
}

/**
 * Like requireOrganizer, but for admin-only endpoints that act on OTHER
 * users' accounts (suspend/delete). Deliberately uses getRealSessionUser,
 * not getAuthUserFromRequest — the demo x-user-role/event_session_role
 * claim is a client-set cookie anyone can flip to "ADMIN" with zero
 * authentication, which is an acceptable stand-in for low-stakes demo data
 * (events) but not for the ability to suspend or delete a real account. A
 * real admin session is required here.
 */
export async function requireAdmin(request?: Request): Promise<AuthResult> {
  const user = await getRealSessionUser(request);

  if (!user) {
    return {
      authorized: false,
      user: null,
      error: "Authentication required",
      status: 401,
    };
  }

  if (user.role !== Role.ADMIN) {
    return {
      authorized: false,
      user,
      error: "Access denied: Admins only",
      status: 403,
    };
  }

  return { authorized: true, user };
}
