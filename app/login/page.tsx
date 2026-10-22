"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "../components/AuthShell";
import { AlertIcon, ArrowRightIcon, LockIcon, MailIcon } from "../components/icons";

type Field = "email" | "password";
type Errors = Partial<Record<Field, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validate(field: Field, value: string): string | undefined {
  switch (field) {
    case "email":
      if (!value.trim()) return "Email is required";
      return EMAIL_RE.test(value.trim()) ? undefined : "Enter a valid email address";
    case "password":
      return value ? undefined : "Password is required";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [values, setValues] = useState({ email: "", password: "" });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const refs = {
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
  };

  const clientErrors: Errors = {
    email: validate("email", values.email),
    password: validate("password", values.password),
  };
  const errorFor = (f: Field) => (touched[f] ? clientErrors[f] : undefined);

  function update(field: Field, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    const firstInvalid = (["email", "password"] as Field[]).find((f) => clientErrors[f]);
    if (firstInvalid) {
      refs[firstInvalid].current?.focus();
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setFormError(data.error ?? "Something went wrong");
        return;
      }

      router.push("/events");
      router.refresh();
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const emailErr = errorFor("email");
  const pwErr = errorFor("password");

  return (
    <AuthShell topRight={<Link href="/signup">Create an account</Link>}>
      <h1>Log in</h1>
      <p className="lede">Welcome back — pick up where you left off.</p>

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
              aria-describedby={emailErr ? "email-error" : undefined}
              required
            />
          </div>
          {emailErr && <FieldError id="email-error">{emailErr}</FieldError>}
        </div>

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
              autoComplete="current-password"
              placeholder="Your password"
              value={values.password}
              onChange={(e) => update("password", e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              aria-invalid={!!pwErr}
              aria-describedby={pwErr ? "password-error" : undefined}
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
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting} aria-busy={submitting}>
          {submitting ? (
            <>
              <span className="spinner" aria-hidden="true" /> Logging in…
            </>
          ) : (
            <>
              Log in <ArrowRightIcon size={18} />
            </>
          )}
        </button>
      </form>

      <p className="auth-foot">
        Don&apos;t have an account? <Link href="/signup">Sign up</Link>
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
