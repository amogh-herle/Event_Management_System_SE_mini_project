"use client";

import { useEffect, useState } from "react";
import { ShieldIcon, UserIcon } from "./icons";

export type RoleType = "ORGANIZER" | "PARTICIPANT" | "ADMIN";

export function RoleSwitcher({ onRoleChange }: { onRoleChange?: (role: RoleType) => void }) {
  const [role, setRole] = useState<RoleType>("ORGANIZER");

  useEffect(() => {
    const match = document.cookie.match(/event_session_role=([^;]+)/);
    if (match) {
      const saved = decodeURIComponent(match[1]).toUpperCase() as RoleType;
      if (saved === "ORGANIZER" || saved === "PARTICIPANT" || saved === "ADMIN") {
        setRole(saved);
      }
    }
  }, []);

  function switchRole(newRole: RoleType) {
    setRole(newRole);
    document.cookie = `event_session_role=${newRole}; path=/; max-age=86400; SameSite=Lax`;
    if (onRoleChange) {
      onRoleChange(newRole);
    } else {
      window.location.reload();
    }
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
