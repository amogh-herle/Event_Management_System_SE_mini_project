"use client";

import { useState } from "react";
import { CheckIcon, SparkIcon } from "@/app/components/icons";

interface RegistrationDetails {
  id: string;
  timestamp: string | Date;
  status: string;
}

interface RegisterButtonProps {
  eventId: string;
  isCancelled?: boolean;
  initialRegistered?: boolean;
  initialRegistrationDetails?: RegistrationDetails;
  isFull?: boolean;
  remainingSeats?: number;
}

export function RegisterButton({
  eventId,
  isCancelled = false,
  initialRegistered = false,
  initialRegistrationDetails,
  isFull = false,
  remainingSeats,
}: RegisterButtonProps) {
  const [step, setStep] = useState<"idle" | "confirming" | "submitting" | "confirmed">("idle");
  const [isRegistered, setIsRegistered] = useState(initialRegistered);
  const [error, setError] = useState<string | null>(null);
  const [registrationDetails, setRegistrationDetails] = useState<RegistrationDetails | null>(
    initialRegistrationDetails ?? null
  );

  if (isCancelled) {
    return (
      <div className="alert alert-warn" role="alert" style={{ marginTop: "1rem" }}>
        <span>This event has been cancelled. Registrations are closed.</span>
      </div>
    );
  }

  if (isRegistered || step === "confirmed") {
    return (
      <div className="alert alert-success" role="status" style={{ marginTop: "1rem" }}>
        <CheckIcon size={20} />
        <div>
          <strong>You are registered for this event!</strong>
          <div style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Status: <span className="badge badge-success" style={{ textTransform: "capitalize" }}>{registrationDetails?.status ?? "confirmed"}</span>
            {registrationDetails?.timestamp && (
              <span style={{ marginLeft: "0.5rem" }}>
                Registered on: {new Date(registrationDetails.timestamp).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // FR-008 / ST_02: Page displays 'Event Full' and the Register button is disabled
  if (isFull || (remainingSeats !== undefined && remainingSeats <= 0)) {
    return (
      <div className="registration-flow" style={{ marginTop: "1.5rem" }}>
        <div className="alert alert-warn" role="alert" style={{ marginBottom: "1rem" }}>
          <span>Event Full — all available seats have been booked. Registrations are closed.</span>
        </div>
        <button
          type="button"
          className="btn"
          disabled
          aria-disabled="true"
          style={{ opacity: 0.6, cursor: "not-allowed" }}
        >
          Event Full
        </button>
      </div>
    );
  }

  async function handleRegister() {
    setStep("submitting");
    setError(null);

    try {
      const res = await fetch(`/api/events/${eventId}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed");
        setStep("idle");
        // 409 from this endpoint only ever means "already registered" —
        // matching on status alone avoids drifting out of sync with the
        // server's exact error wording.
        if (res.status === 409) {
          setIsRegistered(true);
          if (data.registration) {
            setRegistrationDetails({
              id: data.registration.id,
              timestamp: data.registration.timestamp || data.registration.createdAt,
              status: data.registration.status,
            });
          }
        }
        return;
      }

      setRegistrationDetails({
        id: data.id,
        timestamp: data.timestamp || data.createdAt,
        status: data.status,
      });
      setIsRegistered(true);
      setStep("confirmed");
    } catch {
      setError("Network error. Please try again.");
      setStep("idle");
    }
  }

  return (
    <div className="registration-flow" style={{ marginTop: "1.5rem" }}>
      {error && (
        <div className="alert alert-danger" role="alert" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {step === "idle" && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setStep("confirming")}
          aria-label="Register for event"
        >
          <SparkIcon size={16} /> Register for Event
        </button>
      )}

      {step === "confirming" && (
        <div
          className="confirm-modal card"
          style={{
            padding: "1.25rem",
            background: "var(--surface-2)",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
          }}
        >
          <h4 style={{ margin: "0 0 0.5rem 0" }}>Confirm your registration</h4>
          <p style={{ margin: "0 0 1rem 0", color: "var(--text-muted)" }}>
            Are you sure you want to register for this event? Exactly one seat will be reserved for you.
          </p>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRegister}
            >
              Confirm Registration
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setStep("idle");
                setError(null);
              }}
              style={{ background: "transparent", border: "1px solid var(--border)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === "submitting" && (
        <button type="button" className="btn btn-primary" disabled>
          Registering...
        </button>
      )}
    </div>
  );
}
