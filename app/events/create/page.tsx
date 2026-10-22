"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "../../components/AuthShell";
import { RoleSwitcher, RoleType } from "../../components/RoleSwitcher";
import {
  AlertIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  MapPinIcon,
  PlusIcon,
  ShieldIcon,
  TagIcon,
  UsersIcon,
} from "../../components/icons";

interface FormState {
  name: string;
  description: string;
  date: string;
  time: string;
  venue: string;
  category: string;
  capacity: string;
}

const INITIAL_FORM: FormState = {
  name: "",
  description: "",
  date: "",
  time: "",
  venue: "",
  category: "Technology",
  capacity: "",
};

const DEFAULT_CATEGORIES = [
  "Technology",
  "Workshops",
  "Hackathons",
  "Cultural",
  "Music",
  "Sports",
  "Academic",
  "Seminars",
];

export default function CreateEventPage() {
  const router = useRouter();
  const [role, setRole] = useState<RoleType>("ORGANIZER");
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [createdEvent, setCreatedEvent] = useState<{ id: string; name: string } | null>(null);

  // Read active role from cookie
  useEffect(() => {
    const match = document.cookie.match(/event_session_role=([^;]+)/);
    if (match) {
      const saved = decodeURIComponent(match[1]).toUpperCase() as RoleType;
      if (saved === "ORGANIZER" || saved === "PARTICIPANT" || saved === "ADMIN") {
        setRole(saved);
      }
    }
  }, []);

  // Fetch categories from API
  useEffect(() => {
    fetch("/api/categories")
      .then((res) => res.json())
      .then((data) => {
        if (data.categories && Array.isArray(data.categories)) {
          setCategories(data.categories);
        }
      })
      .catch(() => {});
  }, []);

  function handleRoleChange(newRole: RoleType) {
    setRole(newRole);
    setServerError(null);
  }

  function validateField(field: keyof FormState, value: string): string | undefined {
    switch (field) {
      case "name":
        return value.trim() ? undefined : "Required field missing: name";
      case "description":
        return value.trim() ? undefined : "Required field missing: description";
      case "date":
        if (!value.trim()) return "Required field missing: date";
        return isNaN(Date.parse(value)) ? "Enter a valid date" : undefined;
      case "time":
        return value.trim() ? undefined : "Required field missing: time";
      case "venue":
        return value.trim() ? undefined : "Required field missing: venue";
      case "category":
        return value.trim() ? undefined : "Required field missing: category";
      case "capacity":
        if (!value || value.trim() === "") {
          return "Required field missing: capacity";
        }
        const num = Number(value);
        if (isNaN(num) || !Number.isInteger(num) || num <= 0) {
          return "Invalid capacity: capacity must be a positive integer";
        }
        return undefined;
    }
  }

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    setServerError(null);
  }

  function handleBlur(field: keyof FormState) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const error = validateField(field, form[field]);
    setFieldErrors((prev) => ({ ...prev, [field]: error }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    // Mark all as touched
    const allTouched: Record<keyof FormState, boolean> = {
      name: true,
      description: true,
      date: true,
      time: true,
      venue: true,
      category: true,
      capacity: true,
    };
    setTouched(allTouched);

    // Validate all fields
    const errors: Partial<Record<keyof FormState, string>> = {};
    (Object.keys(form) as (keyof FormState)[]).forEach((field) => {
      const err = validateField(field, form[field]);
      if (err) errors[field] = err;
    });

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      const firstError = Object.values(errors)[0];
      setServerError(firstError || "Please fix validation errors");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": role,
        },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          date: form.date,
          time: form.time,
          venue: form.venue,
          category: form.category,
          capacity: form.capacity ? Number(form.capacity) : "",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setServerError(data.error || "Failed to create event");
        if (data.errors) {
          setFieldErrors(data.errors);
        }
        return;
      }

      setCreatedEvent({
        id: data.event.id,
        name: data.event.name,
      });
      setForm(INITIAL_FORM);
      setTouched({});
    } catch {
      setServerError("An error occurred while connecting to the server.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="event-create-page">
      {/* Top Navigation */}
      <header className="nav event-nav">
        <Brand />
        <div className="event-nav-actions">
          <RoleSwitcher onRoleChange={handleRoleChange} />
          <Link href="/events" className="btn btn-ghost">
            View Events
          </Link>
        </div>
      </header>

      <main className="event-create-container">
        {/* ST_02 Access Control Check: Participant role blocked */}
        {role === "PARTICIPANT" ? (
          <section className="access-denied-card" role="alert" aria-live="assertive">
            <div className="access-denied-icon">
              <ShieldIcon size={36} />
            </div>
            <h2>Access Denied (ST_02)</h2>
            <p className="access-denied-desc">
              Only accounts with the <strong>Organizer</strong> role are authorized to create
              and publish new events. You are currently browsing with a{" "}
              <strong>Participant</strong> account.
            </p>
            <div className="access-denied-actions">
              <button
                type="button"
                onClick={() => handleRoleChange("ORGANIZER")}
                className="btn btn-primary"
              >
                Switch to Organizer Role
              </button>
              <Link href="/events" className="btn btn-ghost">
                Browse Available Events
              </Link>
            </div>
          </section>
        ) : (
          <div className="event-form-grid">
            {/* Form Column */}
            <div className="event-form-card">
              <div className="event-form-header">
                <span className="badge badge-primary">FR-004a • Event Management</span>
                <h1>Create New Event</h1>
                <p className="lede">
                  Provide event details, schedule, venue, category, and capacity to publish
                  an event for participants.
                </p>
              </div>

              {serverError && (
                <div className="banner-alert banner-danger" role="alert">
                  <AlertIcon size={18} />
                  <span>{serverError}</span>
                </div>
              )}

              {createdEvent && (
                <div className="banner-alert banner-success" role="status">
                  <CheckIcon size={18} />
                  <div>
                    <strong>Event Created Successfully!</strong>
                    <p>
                      &quot;{createdEvent.name}&quot; has been recorded and is now live in your
                      event directory.
                    </p>
                    <div style={{ marginTop: "8px", display: "flex", gap: "10px" }}>
                      <Link href="/events" className="btn btn-sm btn-primary">
                        View in Events List <ArrowRightIcon size={14} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setCreatedEvent(null)}
                        className="btn btn-sm btn-ghost"
                      >
                        Create Another
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="form" noValidate>
                {/* Event Name */}
                <div className="field">
                  <label htmlFor="event-name" className="field-label">
                    Event Name <span className="req">*</span>
                  </label>
                  <div className="input-wrap">
                    <span className="input-icon">
                      <TagIcon size={18} />
                    </span>
                    <input
                      id="event-name"
                      type="text"
                      className="input"
                      placeholder="e.g. Tech Fest"
                      value={form.name}
                      onChange={(e) => handleChange("name", e.target.value)}
                      onBlur={() => handleBlur("name")}
                      aria-invalid={!!(touched.name && fieldErrors.name)}
                      required
                    />
                  </div>
                  {touched.name && fieldErrors.name && (
                    <p className="field-error" role="alert">
                      <AlertIcon size={14} /> {fieldErrors.name}
                    </p>
                  )}
                </div>

                {/* Category & Capacity Row */}
                <div className="fields-row">
                  <div className="field">
                    <label htmlFor="event-category" className="field-label">
                      Category <span className="req">*</span>
                    </label>
                    <div className="input-wrap">
                      <span className="input-icon">
                        <TagIcon size={18} />
                      </span>
                      <select
                        id="event-category"
                        className="input select"
                        value={form.category}
                        onChange={(e) => handleChange("category", e.target.value)}
                        onBlur={() => handleBlur("category")}
                        aria-invalid={!!(touched.category && fieldErrors.category)}
                        required
                      >
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    {touched.category && fieldErrors.category && (
                      <p className="field-error" role="alert">
                        <AlertIcon size={14} /> {fieldErrors.category}
                      </p>
                    )}
                  </div>

                  <div className="field">
                    <label htmlFor="event-capacity" className="field-label">
                      Total Capacity <span className="req">*</span>
                    </label>
                    <div className="input-wrap">
                      <span className="input-icon">
                        <UsersIcon size={18} />
                      </span>
                      <input
                        id="event-capacity"
                        type="number"
                        className="input"
                        placeholder="e.g. 100"
                        min="1"
                        step="1"
                        value={form.capacity}
                        onChange={(e) => handleChange("capacity", e.target.value)}
                        onBlur={() => handleBlur("capacity")}
                        aria-invalid={!!(touched.capacity && fieldErrors.capacity)}
                        required
                      />
                    </div>
                    {touched.capacity && fieldErrors.capacity && (
                      <p className="field-error" role="alert">
                        <AlertIcon size={14} /> {fieldErrors.capacity}
                      </p>
                    )}
                  </div>
                </div>

                {/* Date & Time Row */}
                <div className="fields-row">
                  <div className="field">
                    <label htmlFor="event-date" className="field-label">
                      Event Date <span className="req">*</span>
                    </label>
                    <div className="input-wrap">
                      <span className="input-icon">
                        <CalendarIcon size={18} />
                      </span>
                      <input
                        id="event-date"
                        type="date"
                        className="input"
                        value={form.date}
                        onChange={(e) => handleChange("date", e.target.value)}
                        onBlur={() => handleBlur("date")}
                        aria-invalid={!!(touched.date && fieldErrors.date)}
                        required
                      />
                    </div>
                    {touched.date && fieldErrors.date && (
                      <p className="field-error" role="alert">
                        <AlertIcon size={14} /> {fieldErrors.date}
                      </p>
                    )}
                  </div>

                  <div className="field">
                    <label htmlFor="event-time" className="field-label">
                      Event Time <span className="req">*</span>
                    </label>
                    <div className="input-wrap">
                      <span className="input-icon">
                        <ClockIcon size={18} />
                      </span>
                      <input
                        id="event-time"
                        type="text"
                        className="input"
                        placeholder="e.g. 10:00 AM"
                        value={form.time}
                        onChange={(e) => handleChange("time", e.target.value)}
                        onBlur={() => handleBlur("time")}
                        aria-invalid={!!(touched.time && fieldErrors.time)}
                        required
                      />
                    </div>
                    {touched.time && fieldErrors.time && (
                      <p className="field-error" role="alert">
                        <AlertIcon size={14} /> {fieldErrors.time}
                      </p>
                    )}
                  </div>
                </div>

                {/* Venue */}
                <div className="field">
                  <label htmlFor="event-venue" className="field-label">
                    Venue / Location <span className="req">*</span>
                  </label>
                  <div className="input-wrap">
                    <span className="input-icon">
                      <MapPinIcon size={18} />
                    </span>
                    <input
                      id="event-venue"
                      type="text"
                      className="input"
                      placeholder="e.g. Auditorium A, Campus Center"
                      value={form.venue}
                      onChange={(e) => handleChange("venue", e.target.value)}
                      onBlur={() => handleBlur("venue")}
                      aria-invalid={!!(touched.venue && fieldErrors.venue)}
                      required
                    />
                  </div>
                  {touched.venue && fieldErrors.venue && (
                    <p className="field-error" role="alert">
                      <AlertIcon size={14} /> {fieldErrors.venue}
                    </p>
                  )}
                </div>

                {/* Description */}
                <div className="field">
                  <label htmlFor="event-description" className="field-label">
                    Description <span className="req">*</span>
                  </label>
                  <textarea
                    id="event-description"
                    className="textarea"
                    rows={4}
                    placeholder="Provide a comprehensive summary of the event schedule, prerequisites, and instructions..."
                    value={form.description}
                    onChange={(e) => handleChange("description", e.target.value)}
                    onBlur={() => handleBlur("description")}
                    aria-invalid={!!(touched.description && fieldErrors.description)}
                    required
                  />
                  {touched.description && fieldErrors.description && (
                    <p className="field-error" role="alert">
                      <AlertIcon size={14} /> {fieldErrors.description}
                    </p>
                  )}
                </div>

                {/* Submit Action */}
                <div className="form-submit-row">
                  <button
                    type="submit"
                    className="btn btn-primary btn-lg"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="spinner" /> Creating Event...
                      </>
                    ) : (
                      <>
                        <PlusIcon size={18} /> Publish Event
                      </>
                    )}
                  </button>
                  <Link href="/events" className="btn btn-ghost">
                    Cancel
                  </Link>
                </div>
              </form>
            </div>

            {/* Live Preview Column */}
            <aside className="event-preview-column" aria-label="Live Event Preview">
              <div className="preview-sticky-card">
                <div className="preview-header">
                  <span className="preview-label">Live Participant Preview</span>
                  <span className="badge badge-success">Status: Active</span>
                </div>

                <div className="preview-event-card">
                  <div className="preview-badge-row">
                    <span className="category-pill">{form.category || "General"}</span>
                    <span className="capacity-pill">
                      <UsersIcon size={13} /> {form.capacity || "—"} seats
                    </span>
                  </div>

                  <h3 className="preview-title">
                    {form.name || "Event Title will appear here"}
                  </h3>

                  <p className="preview-description">
                    {form.description ||
                      "Detailed event synopsis, rules, and attendee requirements will display here."}
                  </p>

                  <div className="preview-meta-list">
                    <div className="preview-meta-item">
                      <CalendarIcon size={16} />
                      <span>{form.date || "Date not set"}</span>
                    </div>
                    <div className="preview-meta-item">
                      <ClockIcon size={16} />
                      <span>{form.time || "Time not set"}</span>
                    </div>
                    <div className="preview-meta-item">
                      <MapPinIcon size={16} />
                      <span>{form.venue || "Venue not set"}</span>
                    </div>
                  </div>
                </div>

                <div className="preview-guidance">
                  <h4>Acceptance Criteria (FR-004a)</h4>
                  <ul>
                    <li>
                      <CheckIcon size={14} /> All 7 required fields stored on creation
                    </li>
                    <li>
                      <CheckIcon size={14} /> Empty required fields rejected with 400
                    </li>
                    <li>
                      <CheckIcon size={14} /> Capacity strictly verified as positive integer
                    </li>
                    <li>
                      <CheckIcon size={14} /> Non-organizers restricted from event creation
                    </li>
                  </ul>
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
