"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton({ className = "btn btn-ghost" }: { className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <button type="button" className={className} onClick={handleLogout} disabled={loading}>
      {loading ? "Logging out…" : "Log out"}
    </button>
  );
}
