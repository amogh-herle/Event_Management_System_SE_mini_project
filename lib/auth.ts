import { cookies, headers } from "next/headers";
import { Role } from "@prisma/client";

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

// Demo-role auth stand-in: there is no real session system yet (FR-002 login
// isn't built), so identity is claimed via an explicit x-user-role header or
// event_session_role cookie. The one rule that actually matters: no claim
// means NOT authenticated. It must never default to the most-privileged role
// — that was the auth bypass (an unauthenticated POST /api/events was being
// treated as ORGANIZER and could create events with zero credentials).
export function getAuthUserFromRequest(request?: Request): AuthUser | null {
  let roleHeader: string | null = null;
  let cookieRole: string | null = null;

  if (request) {
    roleHeader = request.headers.get("x-user-role");
    const cookieHeader = request.headers.get("cookie") || "";
    const match = cookieHeader.match(/event_session_role=([^;]+)/);
    if (match) cookieRole = decodeURIComponent(match[1]);
  } else {
    try {
      const h = headers();
      roleHeader = h.get("x-user-role");
    } catch {
      // Not in server-request context
    }
    try {
      const c = cookies();
      cookieRole = c.get("event_session_role")?.value || null;
    } catch {
      // Not in cookies context
    }
  }

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

type AuthResult =
  | { authorized: true; user: AuthUser }
  | { authorized: false; user: AuthUser | null; error: string; status: number };

export function requireOrganizer(request?: Request): AuthResult {
  const user = getAuthUserFromRequest(request);

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
