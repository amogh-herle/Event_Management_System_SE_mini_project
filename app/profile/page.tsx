"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Brand } from "../components/AuthShell";
import { AlertIcon, CheckIcon, UserIcon, MailIcon } from "../components/icons";

interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function ProfilePage() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        setUser(data.user);
        if (data.user) setName(data.user.name);
      })
      .catch(() => setUser(null));
  }, []);

  const nameErr = !name.trim() ? "Name is required" : undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setSaved(false);
    if (nameErr) {
      nameRef.current?.focus();
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setFormError(data.error ?? "Something went wrong");
        return;
      }

      setUser(data.user);
      setName(data.user.name);
      setSaved(true);
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="events-directory-page">
      <header className="nav event-nav">
        <Brand />
        <div className="event-nav-actions">
          <Link href="/events" className="btn btn-ghost">
            Back to events
          </Link>
        </div>
      </header>

      <main className="events-directory-container" style={{ maxWidth: "560px" }}>
        <div className="directory-header">
          <div>
            <span className="badge badge-primary">Account</span>
            <h1>Your profile</h1>
            <p className="lede">Update your display name. Changes take effect right away.</p>
          </div>
        </div>

        {user === undefined && <div className="loading-state"><span className="spinner" /> Loading...</div>}

        {user === null && (
          <div className="empty-state-card">
            <AlertIcon size={32} />
            <h3>Not signed in</h3>
            <p>You need to be logged in to view or edit your profile.</p>
            <Link href="/login" className="btn btn-primary">Log in</Link>
          </div>
        )}

        {user && (
          <div className="card" style={{ padding: "1.5rem", background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)" }}>
            <form className="form" onSubmit={handleSubmit} noValidate>
              {formError && (
                <div className="alert alert-danger" role="alert">
                  <AlertIcon size={18} />
                  <span>{formError}</span>
                </div>
              )}
              {saved && !formError && (
                <div className="alert alert-success" role="status">
                  <CheckIcon size={18} />
                  <span>Profile updated.</span>
                </div>
              )}

              <div className="field">
                <label className="field-label" htmlFor="email">Email address</label>
                <div className="input-wrap">
                  <span className="input-icon"><MailIcon size={18} /></span>
                  <input
                    id="email"
                    className="input"
                    type="email"
                    value={user.email}
                    disabled
                    aria-readonly="true"
                  />
                </div>
                <p className="field-hint" style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                  Email can&apos;t be changed here.
                </p>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="name">Full name</label>
                <div className="input-wrap">
                  <span className="input-icon"><UserIcon size={18} /></span>
                  <input
                    ref={nameRef}
                    id="name"
                    className="input"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setFormError(null);
                      setSaved(false);
                    }}
                    onBlur={() => setTouched(true)}
                    aria-invalid={!!(touched && nameErr)}
                    aria-describedby={touched && nameErr ? "name-error" : undefined}
                    required
                  />
                </div>
                {touched && nameErr && (
                  <p className="field-error" id="name-error" role="alert">
                    <AlertIcon size={16} />
                    <span>{nameErr}</span>
                  </p>
                )}
              </div>

              <div className="field">
                <label className="field-label">Role</label>
                <div className="input-wrap">
                  <input className="input" type="text" value={user.role} disabled aria-readonly="true" />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" disabled={submitting} aria-busy={submitting}>
                {submitting ? (
                  <><span className="spinner" aria-hidden="true" /> Saving…</>
                ) : (
                  "Save changes"
                )}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
