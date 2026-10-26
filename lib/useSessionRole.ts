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
 * Resolves the role to show/gate on client-side, and whether it's backed by
 * a real logged-in account (`isRealAccount`) or just the demo
 * event_session_role cookie.
 *
 * A real session's role always wins when present — it's checked via
 * /api/auth/me, which (unlike lib/auth.ts's getAuthUserFromRequest) never
 * falls back to the demo claim, so it can tell "a real Organizer account is
 * logged in" apart from "nobody's logged in, the RoleSwitcher cookie just
 * says Organizer". Without this, a real account's role was shadowed by
 * whatever the demo cookie happened to be set to (defaulting to
 * Participant), hiding Create Event / Cancel / Delete controls — and
 * showing the Access Denied screen — for a logged-in Organizer.
 *
 * Falls back to the demo cookie (defaulting to PARTICIPANT, least
 * privilege) only when there's no real session, preserving the existing
 * demo/testing flow.
 */
export function useSessionRole(): [RoleType, (role: RoleType) => void, boolean] {
  const [role, setRole] = useState<RoleType>("PARTICIPANT");
  const [isRealAccount, setIsRealAccount] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : { user: null }))
      .then((data) => {
        if (cancelled) return;
        if (data?.user?.role) {
          setRole(data.user.role);
          setIsRealAccount(true);
          return;
        }
        const saved = readRoleCookie();
        if (saved) setRole(saved);
      })
      .catch(() => {
        if (cancelled) return;
        const saved = readRoleCookie();
        if (saved) setRole(saved);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return [role, setRole, isRealAccount];
}
