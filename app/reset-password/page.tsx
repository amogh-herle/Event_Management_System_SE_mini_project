"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "../components/AuthShell";
import { AlertIcon, ArrowRightIcon, CheckIcon, DotIcon, LockIcon, ShieldIcon } from "../components/icons";

type Status = "form" | "success" | "expired" | "invalid";

function passwordChecks(pw: string) {
  return [
    { label: "At least 8 characters", ok: pw.length >= 8, required: true },
    { label: "Upper & lowercase", ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
    { label: "A number", ok: /\d/.test(pw) },
    { label: "A symbol", ok: /[^A-Za-z0-9]/.test(pw) },
  ];
}
const STRENGTH_LABEL = ["", "Weak", "Fair", "Good", "Strong"];

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <div className="status-card">
            <div className="status-icon" aria-hidden="true">
              <ShieldIcon size={40} />
            </div>
            <h1>Loading&hellip;</h1>
          </div>
        </AuthShell>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<Status>(token ? "form" : "invalid");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const checks = useMemo(() => passwordChecks(password), [password]);
  const strength = password ? Math.max(1, checks.filter((c) => c.ok).length) : 0;
  const passwordErr = password.length >= 8 ? undefined : "Password must be at least 8 characters";
  const confirmErr = confirm !== password ? "Passwords don't match" : undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setConfirmTouched(true);
    if (passwordErr) {
      passwordRef.current?.focus();
      return;
    }
    if (confirmErr) {
      confirmRef.current?.focus();
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setStatus("success");
      } else if (data.status === "expired") {
        setStatus("expired");
      } else if (data.status === "invalid") {
        setStatus("invalid");
      } else {
        setFormError(data.error ?? "Something went wrong");
      }
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "success") {
    return (
      <AuthShell>
        <div className="status-card">
          <div className="status-icon" aria-hidden="true">
            <CheckIcon size={40} />
          </div>
          <h1>Password reset</h1>
          <p className="lede">Your password has been updated. You can now log in with it.</p>
          <div className="actions">
            <Link href="/login" className="btn btn-primary btn-block">
              Go to log in
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  if (status === "expired" || status === "invalid") {
    return (
      <AuthShell>
        <div className="status-card">
          <div className="status-icon" aria-hidden="true">
            <AlertIcon size={40} />
          </div>
          <h1>{status === "expired" ? "Link expired" : "Invalid link"}</h1>
          <p className="lede">
            {status === "expired"
              ? "This password reset link is more than 1 hour old. Request a new one."
              : "This password reset link is missing, malformed, or has already been used."}
          </p>
          <div className="actions">
            <Link href="/forgot-password" className="btn btn-primary btn-block">
              Request a new link
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1>Choose a new password</h1>
      <p className="lede">Make it something you haven&apos;t used here before.</p>

      <form className="form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <div className="alert alert-danger" role="alert">
            <AlertIcon size={18} />
            <span>{formError}</span>
          </div>
        )}

        <div className="field">
          <label className="field-label" htmlFor="password">New password</label>
          <div className="input-wrap">
            <span className="input-icon"><LockIcon size={18} /></span>
            <input
              ref={passwordRef}
              id="password"
              name="password"
              className="input has-toggle"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFormError(null);
              }}
              onBlur={() => setTouched(true)}
              aria-invalid={!!(touched && passwordErr)}
              aria-describedby="password-strength password-rules"
              minLength={8}
              required
            />
            <button
              type="button"
              className="toggle-visibility"
              onClick={() => setShowPassword((s) => !s)}
              aria-pressed={showPassword}
              aria-controls="password"
            >
              {showPassword ? "Hide" : "Show"}
              <span className="sr-only"> password</span>
            </button>
          </div>
          {touched && passwordErr && (
            <p className="field-error" role="alert">
              <AlertIcon size={16} />
              <span>{passwordErr}</span>
            </p>
          )}

          <div className="strength" data-level={strength} aria-hidden="true">
            <span /><span /><span /><span />
          </div>
          <div className="strength-row" id="password-strength" aria-live="polite">
            <span>Password strength</span>
            <span>{password ? STRENGTH_LABEL[strength] : "—"}</span>
          </div>
          <ul className="checklist" id="password-rules">
            {checks.map((c) => (
              <li key={c.label} data-ok={c.ok}>
                {c.ok ? <CheckIcon size={14} /> : <DotIcon size={14} />}
                {c.label}
                {c.required ? <span className="sr-only"> (required)</span> : null}
                <span className="sr-only">{c.ok ? " — met" : " — not met"}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="confirm">Confirm new password</label>
          <div className="input-wrap">
            <span className="input-icon"><LockIcon size={18} /></span>
            <input
              ref={confirmRef}
              id="confirm"
              name="confirm"
              className="input"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Re-enter your new password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setFormError(null);
              }}
              onBlur={() => setConfirmTouched(true)}
              aria-invalid={!!(confirmTouched && confirmErr)}
              aria-describedby={confirmTouched && confirmErr ? "confirm-error" : undefined}
              required
            />
          </div>
          {confirmTouched && confirmErr && (
            <p className="field-error" id="confirm-error" role="alert">
              <AlertIcon size={16} />
              <span>{confirmErr}</span>
            </p>
          )}
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting} aria-busy={submitting}>
          {submitting ? (
            <>
              <span className="spinner" aria-hidden="true" /> Resetting…
            </>
          ) : (
            <>
              Reset password <ArrowRightIcon size={18} />
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
