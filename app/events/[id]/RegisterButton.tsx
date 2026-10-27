"use client";

import { useState } from "react";
import { CheckIcon, ClockIcon, SparkIcon, XCircleIcon } from "@/app/components/icons";

interface RegistrationDetails {
  id: string;
  timestamp: string | Date;
  status: string;
  waitlistPosition?: number;
}

interface RegisterButtonProps {
  eventId: string;
  isCancelled?: boolean;
  initialRegistered?: boolean;
  initialRegistrationDetails?: RegistrationDetails;
  isFull?: boolean;
  remainingSeats?: number;
  waitlistCount?: number;
}

export function RegisterButton({
  eventId,
  isCancelled = false,
  initialRegistered = false,
  initialRegistrationDetails,
  isFull = false,
  remainingSeats,
  waitlistCount,
}: RegisterButtonProps) {
  const [step, setStep] = useState<
    "idle" | "confirming" | "submitting" | "confirming_waitlist" | "joining_waitlist" | "confirming_cancel" | "cancelling"
  >("idle");
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

  // Cancel action (self-cancellation or leaving waitlist)
  async function handleCancelRegistration() {
    setStep("cancelling");
    setError(null);

    try {
      const res = await fetch(`/api/events/${eventId}/register`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to cancel registration");
        setStep("idle");
        return;
      }

      setIsRegistered(false);
      setRegistrationDetails(null);
      setStep("idle");
    } catch {
      setError("Network error. Please try again.");
      setStep("idle");
    }
  }

  // Handle joining the waitlist
  async function handleJoinWaitlist() {
    setStep("joining_waitlist");
    setError(null);

    try {
      const res = await fetch(`/api/events/${eventId}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waitlist: true }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to join waitlist");
        setStep("idle");
        if (res.status === 409 && data.registration) {
          setIsRegistered(true);
          setRegistrationDetails({
            id: data.registration.id,
            timestamp: data.registration.timestamp || data.registration.createdAt,
            status: data.registration.status,
            waitlistPosition: data.registration.waitlistPosition ?? data.waitlistPosition,
          });
        }
        return;
      }

      setRegistrationDetails({
        id: data.id,
        timestamp: data.timestamp || data.createdAt,
        status: data.status,
        waitlistPosition: data.waitlistPosition,
      });
      setIsRegistered(true);
      setStep("idle");
    } catch {
      setError("Network error. Please try again.");
      setStep("idle");
    }
  }

  // Normal registration for events with open seats
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
        if (res.status === 409) {
          setIsRegistered(true);
          if (data.registration) {
            setRegistrationDetails({
              id: data.registration.id,
              timestamp: data.registration.timestamp || data.registration.createdAt,
              status: data.registration.status,
              waitlistPosition: data.registration.waitlistPosition ?? data.waitlistPosition,
            });
          }
        }
        return;
      }

      setRegistrationDetails({
        id: data.id,
        timestamp: data.timestamp || data.createdAt,
        status: data.status,
        waitlistPosition: data.waitlistPosition,
      });
      setIsRegistered(true);
      setStep("idle");
    } catch {
      setError("Network error. Please try again.");
      setStep("idle");
    }
  }

  // ── Render: Waitlisted User ────────────────────────────────────────────────
  if (isRegistered && registrationDetails?.status === "waitlisted") {
    return (
      <div className="registration-flow" style={{ marginTop: "1.5rem" }}>
        {error && (
          <div className="alert alert-danger" role="alert" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}
        <div className="alert alert-warn" role="status" style={{ marginBottom: "1rem" }}>
          <ClockIcon size={20} />
          <div>
            <strong>You are on the waitlist for this event!</strong>
            <div style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}>
              Status: <span className="badge badge-warning" style={{ textTransform: "capitalize" }}>Waitlisted</span>
              {registrationDetails.waitlistPosition !== undefined && (
                <span style={{ marginLeft: "0.5rem", fontWeight: 600 }}>
                  Queue Position: #{registrationDetails.waitlistPosition}
                </span>
              )}
              {registrationDetails.timestamp && (
                <span style={{ marginLeft: "0.5rem" }}>
                  Joined: {new Date(registrationDetails.timestamp).toLocaleString()}
                </span>
              )}
            </div>
            <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.825rem", color: "var(--text-muted)" }}>
              If a seat opens due to cancellation, you will be automatically promoted to confirmed and notified immediately.
            </p>
          </div>
        </div>

        {step === "idle" && (
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            onClick={() => setStep("confirming_cancel")}
            style={{ border: "1px solid var(--border)" }}
          >
            <XCircleIcon size={14} /> Leave Waitlist
          </button>
        )}

        {step === "confirming_cancel" && (
          <div className="card" style={{ padding: "1rem", background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <p style={{ margin: "0 0 0.75rem 0" }}>Are you sure you want to leave the waitlist? You will lose your position.</p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" className="btn btn-danger btn-sm" onClick={handleCancelRegistration}>
                Confirm Leave
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setStep("idle")} style={{ border: "1px solid var(--border)" }}>
                Keep My Spot
              </button>
            </div>
          </div>
        )}

        {step === "cancelling" && (
          <button type="button" className="btn btn-sm" disabled>
            Updating...
          </button>
        )}
      </div>
    );
  }

  // ── Render: Confirmed User ────────────────────────────────────────────────
  if (isRegistered) {
    return (
      <div className="registration-flow" style={{ marginTop: "1.5rem" }}>
        {error && (
          <div className="alert alert-danger" role="alert" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}
        <div className="alert alert-success" role="status" style={{ marginBottom: "1rem" }}>
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

        {step === "idle" && (
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            onClick={() => setStep("confirming_cancel")}
            style={{ border: "1px solid var(--border)" }}
          >
            <XCircleIcon size={14} /> Cancel Registration
          </button>
        )}

        {step === "confirming_cancel" && (
          <div className="card" style={{ padding: "1rem", background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <p style={{ margin: "0 0 0.75rem 0" }}>
              Are you sure you want to cancel your registration? Your seat will be freed or offered to the next waitlisted user.
            </p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" className="btn btn-danger btn-sm" onClick={handleCancelRegistration}>
                Confirm Cancellation
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setStep("idle")} style={{ border: "1px solid var(--border)" }}>
                Keep Registration
              </button>
            </div>
          </div>
        )}

        {step === "cancelling" && (
          <button type="button" className="btn btn-sm" disabled>
            Cancelling...
          </button>
        )}
      </div>
    );
  }

  // ── Render: Full Event (FR-008 & FR-009a Waitlist Option) ──────────────────
  if (isFull || (remainingSeats !== undefined && remainingSeats <= 0)) {
    return (
      <div className="registration-flow" style={{ marginTop: "1.5rem" }}>
        {error && (
          <div className="alert alert-danger" role="alert" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}
        <div className="alert alert-warn" role="alert" style={{ marginBottom: "1rem" }}>
          <span>
            Event Full — all available seats have been booked.
            {waitlistCount !== undefined && waitlistCount > 0 ? ` (${waitlistCount} currently on waitlist)` : ""}
          </span>
        </div>

        {step === "idle" && (
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button
              type="button"
              className="btn"
              disabled
              aria-disabled="true"
              style={{ opacity: 0.6, cursor: "not-allowed" }}
            >
              Event Full
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep("confirming_waitlist")}
              aria-label="Join Waitlist"
            >
              <ClockIcon size={16} /> Join Waitlist
            </button>
          </div>
        )}

        {step === "confirming_waitlist" && (
          <div
            className="confirm-modal card"
            style={{
              padding: "1.25rem",
              background: "var(--surface-2)",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
            }}
          >
            <h4 style={{ margin: "0 0 0.5rem 0" }}>Join the Waitlist</h4>
            <p style={{ margin: "0 0 1rem 0", color: "var(--text-muted)" }}>
              If an attendee cancels their seat, the system will automatically promote waitlisted participants in the order they joined and notify you immediately.
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleJoinWaitlist}
              >
                Confirm Join Waitlist
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

        {step === "joining_waitlist" && (
          <button type="button" className="btn btn-primary" disabled>
            Joining waitlist...
          </button>
        )}
      </div>
    );
  }

  // ── Render: Available Event (Normal Registration) ──────────────────────────
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
