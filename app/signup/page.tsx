"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "../components/AuthShell";
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  DotIcon,
  LockIcon,
  MailIcon,
  UserIcon,
} from "../components/icons";

type Field = "name" | "email" | "password";
type Errors = Partial<Record<Field, string>>;

// Mirrors lib/validation.ts (server stays the source of truth).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validate(field: Field, value: string): string | undefined {
  switch (field) {
    case "name":
      return value.trim() ? undefined : "Name is required";
    case "email":
      if (!value.trim()) return "Email is required";
      return EMAIL_RE.test(value.trim()) ? undefined : "Enter a valid email address";
    case "password":
      return value.length >= 8 ? undefined : "Password must be at least 8 characters";
  }
}

function passwordChecks(pw: string) {
  return [
    { label: "At least 8 characters", ok: pw.length >= 8, required: true },
    { label: "Upper & lowercase", ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
    { label: "A number", ok: /\d/.test(pw) },
    { label: "A symbol", ok: /[^A-Za-z0-9]/.test(pw) },
  ];
}
const STRENGTH_LABEL = ["", "Weak", "Fair", "Good", "Strong"];

export default function SignupPage() {
  const router = useRouter();
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const refs = {
    name: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
  };

  const clientErrors: Errors = {
    name: validate("name", values.name),
    email: validate("email", values.email),
    password: validate("password", values.password),
  };
  const errorFor = (f: Field) =>
    serverErrors[f] ?? (touched[f] ? clientErrors[f] : undefined);

  const checks = useMemo(() => passwordChecks(values.password), [values.password]);
  const strength = values.password ? Math.max(1, checks.filter((c) => c.ok).length) : 0;

  function update(field: Field, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    if (serverErrors[field]) setServerErrors((e) => ({ ...e, [field]: undefined }));
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true });
    const firstInvalid = (["name", "email", "password"] as Field[]).find((f) => clientErrors[f]);
    if (firstInvalid) {
      refs[firstInvalid].current?.focus();
      return;
    }

    setFormError(null);
    setServerErrors({});
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message: string = data.error ?? "Something went wrong";
        if (res.status === 409) {
          setServerErrors({ email: message });
          refs.email.current?.focus();
        } else if (/email/i.test(message)) {
          setServerErrors({ email: message });
          refs.email.current?.focus();
        } else if (/password/i.test(message)) {
          setServerErrors({ password: message });
          refs.password.current?.focus();
        } else if (/name/i.test(message)) {
          setServerErrors({ name: message });
          refs.name.current?.focus();
        } else {
          setFormError(message);
        }
        return;
      }

      const email = encodeURIComponent(data.email ?? values.email.trim());
      router.push(`/signup/pending-verification?email=${email}`);
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const nameErr = errorFor("name");
  const emailErr = errorFor("email");
  const pwErr = errorFor("password");

  return (
    <AuthShell topRight={<span>Step 1 of 2</span>}>
      <h1>Create your account</h1>
      <p className="lede">Join to discover events and save your seat in seconds.</p>

      <form className="form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <div className="alert alert-danger" role="alert">
            <AlertIcon size={18} />
            <span>{formError}</span>
          </div>
        )}

        {/* Name */}
        <div className="field">
          <label className="field-label" htmlFor="name">Full name</label>
          <div className="input-wrap">
            <span className="input-icon"><UserIcon size={18} /></span>
            <input
              ref={refs.name}
              id="name"
              name="name"
              className="input"
              type="text"
              autoComplete="name"
              placeholder="e.g. Priya Sharma"
              value={values.name}
              onChange={(e) => update("name", e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              aria-invalid={!!nameErr}
              aria-describedby={nameErr ? "name-error" : undefined}
              required
            />
            {!nameErr && touched.name && values.name.trim() && (
              <span className="input-valid"><CheckIcon size={18} /></span>
            )}
          </div>
          {nameErr && <FieldError id="name-error">{nameErr}</FieldError>}
        </div>

        {/* Email */}
        <div className="field">
          <label className="field-label" htmlFor="email">Email address</label>
          <div className="input-wrap">
            <span className="input-icon"><MailIcon size={18} /></span>
            <input
              ref={refs.email}
              id="email"
              name="email"
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@college.edu"
              value={values.email}
              onChange={(e) => update("email", e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              aria-invalid={!!emailErr}
              aria-describedby={emailErr ? "email-error" : "email-hint"}
              required
            />
            {!emailErr && touched.email && !clientErrors.email && (
              <span className="input-valid"><CheckIcon size={18} /></span>
            )}
          </div>
          {emailErr ? (
            <FieldError id="email-error">{emailErr}</FieldError>
          ) : (
            <span id="email-hint" className="sr-only">We&apos;ll send a verification link here.</span>
          )}
        </div>

        {/* Password */}
        <div className="field">
          <label className="field-label" htmlFor="password">Password</label>
          <div className="input-wrap">
            <span className="input-icon"><LockIcon size={18} /></span>
            <input
              ref={refs.password}
              id="password"
              name="password"
              className="input has-toggle"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={values.password}
              onChange={(e) => update("password", e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              aria-invalid={!!pwErr}
              aria-describedby={`${pwErr ? "password-error " : ""}password-strength password-rules`}
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
          {pwErr && <FieldError id="password-error">{pwErr}</FieldError>}

          <div className="strength" data-level={strength} aria-hidden="true">
            <span /><span /><span /><span />
          </div>
          <div className="strength-row" id="password-strength" aria-live="polite">
            <span>Password strength</span>
            <span>{values.password ? STRENGTH_LABEL[strength] : "—"}</span>
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

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting} aria-busy={submitting}>
          {submitting ? (
            <>
              <span className="spinner" aria-hidden="true" /> Creating your account…
            </>
          ) : (
            <>
              Create account <ArrowRightIcon size={18} />
            </>
          )}
        </button>
      </form>

      <p className="auth-foot">
        By creating an account you agree to the event guidelines and privacy policy.
        Your password is stored securely hashed — never in plain text.
      </p>
    </AuthShell>
  );
}

function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p className="field-error" id={id} role="alert">
      <AlertIcon size={16} />
      <span>{children}</span>
    </p>
  );
}
