"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "../components/AuthShell";
import { AlertIcon, CheckIcon, ShieldIcon } from "../components/icons";

type Status = "verifying" | "success" | "expired" | "invalid";

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <div className="status-card">
            <div className="status-icon" aria-hidden="true">
              <ShieldIcon size={40} />
            </div>
            <h1>Verifying your email&hellip;</h1>
          </div>
        </AuthShell>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}

function VerifyContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>(token ? "verifying" : "invalid");
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;

    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setStatus("success");
        } else if (data.status === "expired") {
          setStatus("expired");
        } else {
          setStatus("invalid");
        }
      })
      .catch(() => setStatus("invalid"));
  }, [token]);

  return (
    <AuthShell>
      <div className="status-card">
        {status === "verifying" && (
          <>
            <div className="status-icon" aria-hidden="true">
              <ShieldIcon size={40} />
            </div>
            <h1>Verifying your email&hellip;</h1>
            <p className="lede">This only takes a second.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="status-icon" aria-hidden="true">
              <CheckIcon size={40} />
            </div>
            <h1>Email verified</h1>
            <p className="lede">Your account is active. You can now log in.</p>
            <div className="actions">
              <Link href="/" className="btn btn-primary btn-block">
                Continue
              </Link>
            </div>
          </>
        )}

        {status === "expired" && (
          <>
            <div className="status-icon" aria-hidden="true">
              <AlertIcon size={40} />
            </div>
            <h1>Link expired</h1>
            <p className="lede">
              This verification link is more than 24 hours old. Request a new one from the
              pending-verification page.
            </p>
            <div className="actions">
              <Link href="/signup" className="btn btn-primary btn-block">
                Back to sign up
              </Link>
            </div>
          </>
        )}

        {status === "invalid" && (
          <>
            <div className="status-icon" aria-hidden="true">
              <AlertIcon size={40} />
            </div>
            <h1>Invalid link</h1>
            <p className="lede">
              This verification link is missing, malformed, or has already been used.
            </p>
            <div className="actions">
              <Link href="/signup" className="btn btn-primary btn-block">
                Back to sign up
              </Link>
            </div>
          </>
        )}
      </div>
    </AuthShell>
  );
}
