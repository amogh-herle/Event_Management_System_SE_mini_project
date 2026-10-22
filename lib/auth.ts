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

export function getAuthUserFromRequest(request?: Request): AuthUser {
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

  const effectiveRole = (roleHeader || cookieRole || "ORGANIZER").toUpperCase();

  if (effectiveRole === "PARTICIPANT") {
    return DEMO_PARTICIPANT;
  }
  if (effectiveRole === "ADMIN") {
    return DEMO_ADMIN;
  }
  return DEMO_ORGANIZER;
}

export function requireOrganizer(request?: Request): {
  authorized: boolean;
  user: AuthUser;
  error?: string;
  status?: number;
} {
  const user = getAuthUserFromRequest(request);

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
