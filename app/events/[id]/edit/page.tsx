"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Brand } from "../../../components/AuthShell";
import { RoleSwitcher } from "../../../components/RoleSwitcher";
import { useSessionRole, type RoleType } from "@/lib/useSessionRole";
import {
  AlertIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  MapPinIcon,
  ShieldIcon,
  TagIcon,
  UsersIcon,
} from "../../../components/icons";

interface FormState {
  name: string;
  description: string;
  date: string;
  time: string;
  venue: string;
  category: string;
  capacity: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  date: "",
  time: "",
  venue: "",
  category: "",
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

// FR-004b: organizer edits an existing event's details. Mirrors the
// FR-004a create form (same fields, validation and layout), pre-filled from
// GET /api/events/[id] and saved with PUT /api/events/[id].
export default function EditEventPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const [role, setRole] = useSessionRole();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCancelled, setIsCancelled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});

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

  // Load the existing event so its current details appear in the form
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/events/${eventId}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data.event) {
          setLoadError(data.error || "Failed to load event");
          return;
        }
        const evt = data.event;
        setForm({
          name: evt.name ?? "",
          description: evt.description ?? "",
          date: typeof evt.date === "string" ? evt.date.slice(0, 10) : "",
          time: evt.time ?? "",
          venue: evt.venue ?? "",
          category: evt.category ?? "",
          capacity: evt.capacity != null ? String(evt.capacity) : "",
        });
        setIsCancelled(evt.status === "CANCELLED");
      })
      .catch(() => {
        if (!cancelled) setLoadError("An error occurred while connecting to the server.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // Keep the event's current category selectable even if it isn't in the list
  const categoryOptions =
    form.category && !categories.includes(form.category)
      ? [form.category, ...categories]
      : categories;

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
        if (num > 100_000) {
          return "Invalid capacity: must be 100,000 or less";
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
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PUT",
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
        setServerError(data.error || "Failed to update event");
        if (data.errors) {
          setFieldErrors(data.errors);
        }
        return;
      }

      // Show the updated details straight away on the event page
      router.push(`/events/${eventId}`);
      router.refresh();
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
        {role === "PARTICIPANT" ? (
          <section className="access-denied-card" role="alert" aria-live="assertive">
            <div className="access-denied-icon">
              <ShieldIcon size={36} />
            </div>
            <h2>Access Denied</h2>
            <p className="access-denied-desc">
              Only the <strong>Organizer</strong> who created this event can edit its details.
              You are currently browsing with a <strong>Participant</strong> account.
            </p>
            <div className="access-denied-actions">
              <Link href={`/events/${eventId}`} className="btn btn-ghost">
                Back to Event
              </Link>
            </div>
          </section>
        ) : loading ? (
          <section className="event-form-card" aria-busy="true">
            <p className="lede">
              <span className="spinner" /> Loading event details...
            </p>
          </section>
        ) : loadError ? (
          <section className="access-denied-card" role="alert">
            <div className="access-denied-icon">
              <AlertIcon size={36} />
            </div>
            <h2>Unable to load event</h2>
            <p className="access-denied-desc">{loadError}</p>
            <div className="access-denied-actions">
              <Link href="/events" className="btn btn-ghost">
                Browse Events
              </Link>
            </div>
          </section>
        ) : (
          <div className="event-form-grid">
            {/* Form Column */}
            <div className="event-form-card">
              <div className="event-form-header">
                <span className="badge badge-primary">FR-004b • Event Management</span>
                <h1>Edit Event</h1>
                <p className="lede">
                  Update the event&apos;s details, schedule, venue, category, or capacity. Existing
                  registrations are kept, and registered participants are notified of changes
                  by email.
                </p>
              </div>

              {isCancelled && (
                <div className="banner-alert banner-danger" role="alert">
                  <AlertIcon size={18} />
                  <span>This event has been cancelled and can no longer be edited.</span>
                </div>
              )}

              {serverError && (
                <div className="banner-alert banner-danger" role="alert">
                  <AlertIcon size={18} />
                  <span>{serverError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="form" noValidate>
                <fieldset disabled={isCancelled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
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
                          {categoryOptions.map((c) => (
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
                </fieldset>

                {/* Submit Action */}
                <div className="form-submit-row">
                  <button
                    type="submit"
                    className="btn btn-primary btn-lg"
                    disabled={isSubmitting || isCancelled}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="spinner" /> Saving Changes...
                      </>
                    ) : (
                      <>
                        <CheckIcon size={18} /> Save Changes
                      </>
                    )}
                  </button>
                  <Link href={`/events/${eventId}`} className="btn btn-ghost">
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
                  <span className={`badge ${isCancelled ? "badge-danger" : "badge-success"}`}>
                    Status: {isCancelled ? "Cancelled" : "Active"}
                  </span>
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
                  <h4>Acceptance Criteria (FR-004b)</h4>
                  <ul>
                    <li>
                      <CheckIcon size={14} /> Edited fields save to the existing event
                    </li>
                    <li>
                      <CheckIcon size={14} /> Updated details display immediately
                    </li>
                    <li>
                      <CheckIcon size={14} /> Only the event&apos;s organizer can edit it
                    </li>
                    <li>
                      <CheckIcon size={14} /> Existing registrations are preserved
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
