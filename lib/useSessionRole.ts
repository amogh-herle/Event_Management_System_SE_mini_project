"use client";

import { useEffect, useState } from "react";

export type RoleType = "ORGANIZER" | "PARTICIPANT" | "ADMIN";

const VALID_ROLES: RoleType[] = ["ORGANIZER", "PARTICIPANT", "ADMIN"];

function readRoleCookie(): RoleType | null {
  const match = document.cookie.match(/event_session_role=([^;]+)/);
  if (!match) return null;
  const saved = decodeURIComponent(match[1]).toUpperCase() as RoleType;
  return VALID_ROLES.includes(saved) ? saved : null;
}

/**
 * Demo-session role, read from the event_session_role cookie. Defaults to
 * PARTICIPANT (least privilege) until/unless a cookie says otherwise — never
 * default to the most-privileged role for a visitor we know nothing about.
 */
export function useSessionRole(): [RoleType, (role: RoleType) => void] {
  const [role, setRole] = useState<RoleType>("PARTICIPANT");

  useEffect(() => {
    const saved = readRoleCookie();
    if (saved) setRole(saved);
  }, []);

  return [role, setRole];
}
