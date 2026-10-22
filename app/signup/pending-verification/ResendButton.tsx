"use client";

import { useState } from "react";

export function ResendButton({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleResend() {
    setState("sending");
    setMessage(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      setMessage(data.message ?? "If that email is registered, a new link is on its way.");
      setState("sent");
    } catch {
      setMessage("Couldn't reach the server. Try again.");
      setState("idle");
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={handleResend}
        disabled={state === "sending" || !email}
        aria-disabled={state === "sending" || !email}
      >
        {state === "sending" ? "Sending…" : "Resend verification email"}
      </button>
      {message && (
        <p className="hint" style={{ textAlign: "center" }}>
          {message}
        </p>
      )}
    </>
  );
}
