"use client";

import Link from "next/link";
import { ShieldIcon, UserIcon } from "./icons";
import { useSessionRole, type RoleType } from "@/lib/useSessionRole";
import { LogoutButton } from "./LogoutButton";

export type { RoleType };

export function RoleSwitcher({ onRoleChange }: { onRoleChange?: (role: RoleType) => void }) {
  const [role, setRole, isRealAccount] = useSessionRole();

  function switchRole(newRole: RoleType) {
    setRole(newRole);
    document.cookie = `event_session_role=${newRole}; path=/; max-age=86400; SameSite=Lax`;
    if (onRoleChange) {
      onRoleChange(newRole);
    } else {
      window.location.reload();
    }
  }

  // A real logged-in account's role is fixed in the database — the demo
  // cookie this switches has no effect once a real session is present
  // (the session always wins), so offering the switch buttons here would
  // just be misleading. Show the account's real role instead.
  if (isRealAccount) {
    return (
      <div className="role-switcher-container" role="region" aria-label="Signed in">
        <div className="role-badge" title="Your account's role">
          <span className="role-badge-icon" aria-hidden="true">
            {role === "ORGANIZER" ? <ShieldIcon size={14} /> : <UserIcon size={14} />}
          </span>
          <span className="role-badge-label">
            Signed in as: <strong>{role}</strong>
          </span>
        </div>
        <Link href="/profile" className="btn btn-sm btn-ghost">
          Profile
        </Link>
        {role === "ADMIN" && (
          <>
            <Link href="/admin/stats" className="btn btn-sm btn-ghost">
              Platform Stats
            </Link>
            <Link href="/admin/users" className="btn btn-sm btn-ghost">
              Manage Users
            </Link>
          </>
        )}
        <LogoutButton className="btn btn-sm btn-ghost" />
      </div>
    );
  }

  return (
    <div className="role-switcher-container" role="region" aria-label="Role Simulator">
      <div className="role-badge" title="Simulated session role for RBAC testing">
        <span className="role-badge-icon" aria-hidden="true">
          {role === "ORGANIZER" ? <ShieldIcon size={14} /> : <UserIcon size={14} />}
        </span>
        <span className="role-badge-label">
          Role: <strong>{role}</strong>
        </span>
      </div>
      <div className="role-switch-buttons" role="group" aria-label="Switch active role">
        <button
          type="button"
          onClick={() => switchRole("ORGANIZER")}
          className={`role-btn ${role === "ORGANIZER" ? "active" : ""}`}
          aria-pressed={role === "ORGANIZER"}
          title="Switch to Organizer (can create events)"
        >
          Organizer
        </button>
        <button
          type="button"
          onClick={() => switchRole("PARTICIPANT")}
          className={`role-btn ${role === "PARTICIPANT" ? "active" : ""}`}
          aria-pressed={role === "PARTICIPANT"}
          title="Switch to Participant (tests ST_02 access restriction)"
        >
          Participant
        </button>
      </div>
    </div>
  );
}
