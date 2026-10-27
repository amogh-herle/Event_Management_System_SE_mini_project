"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AuthShell } from "../components/AuthShell";
import { AlertIcon, ArrowRightIcon, CheckIcon, MailIcon } from "../components/icons";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const emailErr = !email.trim()
    ? "Email is required"
    : !EMAIL_RE.test(email.trim())
      ? "Enter a valid email address"
      : undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (emailErr) {
      emailRef.current?.focus();
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Deliberately always treat this as success in the UI — the server
      // returns the same generic message whether or not the account
      // exists, so there's nothing account-specific to branch on here.
      if (res.ok) {
        setSent(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error ?? "Something went wrong");
      }
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthShell topRight={<Link href="/login">Back to log in</Link>}>
        <div className="status-card">
          <div className="status-icon" aria-hidden="true">
            <MailIcon size={40} />
            <span className="badge"><CheckIcon size={16} /></span>
          </div>
          <h1>Check your inbox</h1>
          <p className="lede" style={{ marginBottom: 12 }}>
            If <strong>{email}</strong> is registered, a password reset link is on its way.
            It can take a minute to arrive — check spam or promotions too.
          </p>
          <p className="lede" style={{ fontSize: "0.85rem" }}>
            The link expires in 1 hour.
          </p>
        </div>

        <div className="actions">
          <Link href="/login" className="btn btn-primary btn-block">
            Back to log in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell topRight={<Link href="/login">Back to log in</Link>}>
      <h1>Forgot your password?</h1>
      <p className="lede">Enter your account email and we&apos;ll send you a reset link.</p>

      <form className="form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <div className="alert alert-danger" role="alert">
            <AlertIcon size={18} />
            <span>{formError}</span>
          </div>
        )}

        <div className="field">
          <label className="field-label" htmlFor="email">Email address</label>
          <div className="input-wrap">
            <span className="input-icon"><MailIcon size={18} /></span>
            <input
              ref={emailRef}
              id="email"
              name="email"
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@college.edu"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFormError(null);
              }}
              onBlur={() => setTouched(true)}
              aria-invalid={!!(touched && emailErr)}
              aria-describedby={touched && emailErr ? "email-error" : undefined}
              required
            />
          </div>
          {touched && emailErr && (
            <p className="field-error" id="email-error" role="alert">
              <AlertIcon size={16} />
              <span>{emailErr}</span>
            </p>
          )}
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting} aria-busy={submitting}>
          {submitting ? (
            <>
              <span className="spinner" aria-hidden="true" /> Sending…
            </>
          ) : (
            <>
              Send reset link <ArrowRightIcon size={18} />
            </>
          )}
        </button>
      </form>

      <p className="auth-foot">
        Remembered your password? <Link href="/login">Log in</Link>
      </p>
    </AuthShell>
  );
}
