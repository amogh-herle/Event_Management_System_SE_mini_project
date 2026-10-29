"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Brand } from "../../../components/AuthShell";
import { RoleSwitcher } from "../../../components/RoleSwitcher";
import { useSessionRole, type RoleType } from "@/lib/useSessionRole";
import { AlertIcon, CheckIcon, ShieldIcon } from "../../../components/icons";
import {
  EventFormFields,
  EventPreviewPanel,
  EVENT_DEFAULT_CATEGORIES,
  validateEventField,
  validateEventForm,
  type EventFormState as FormState,
} from "../../../components/EventFormFields";

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  date: "",
  time: "",
  venue: "",
  category: "",
  capacity: "",
};

// FR-004b: organizer edits an existing event's details. Shares fields,
// validation and layout with the FR-004a create form (see
// components/EventFormFields), pre-filled from GET /api/events/[id] and
// saved with PUT /api/events/[id].
export default function EditEventPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const [role, setRole] = useSessionRole();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [categories, setCategories] = useState<string[]>(EVENT_DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCancelled, setIsCancelled] = useState(false);
  // Tracked so the save request can detect a conflicting edit made
  // elsewhere between load and save (see EVENT_EDIT_CONFLICT_ERROR).
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState<string | null>(null);
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
        setLoadedUpdatedAt(typeof evt.updatedAt === "string" ? evt.updatedAt : null);
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

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    setServerError(null);
  }

  function handleBlur(field: keyof FormState) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const error = validateEventField(field, form[field]);
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
    const errors = validateEventForm(form);
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
          ...(loadedUpdatedAt ? { updatedAt: loadedUpdatedAt } : {}),
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

  let body: React.ReactNode;
  if (role === "PARTICIPANT") {
    body = (
      <section className="access-denied-card" role="alert" aria-live="assertive">
        <div className="access-denied-icon">
          <ShieldIcon size={36} />
        </div>
        <h2>Access Denied</h2>
        <p className="access-denied-desc">
          Only the <strong>Organizer</strong> who created this event can edit its details. You
          are currently browsing with a <strong>Participant</strong> account.
        </p>
        <div className="access-denied-actions">
          <Link href={`/events/${eventId}`} className="btn btn-ghost">
            Back to Event
          </Link>
        </div>
      </section>
    );
  } else if (loading) {
    body = (
      <section className="event-form-card" aria-busy="true">
        <p className="lede">
          <span className="spinner" /> Loading event details...
        </p>
      </section>
    );
  } else if (loadError) {
    body = (
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
    );
  } else {
    body = (
      <div className="event-form-grid">
        {/* Form Column */}
        <div className="event-form-card">
          <div className="event-form-header">
            <span className="badge badge-primary">FR-004b • Event Management</span>
            <h1>Edit Event</h1>
            <p className="lede">
              Update the event&apos;s details, schedule, venue, category, or capacity. Existing
              registrations are kept.
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
              <EventFormFields
                form={form}
                touched={touched}
                fieldErrors={fieldErrors}
                categoryOptions={categoryOptions}
                onChange={handleChange}
                onBlur={handleBlur}
              />
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

        <EventPreviewPanel
          form={form}
          statusLabel={isCancelled ? "Cancelled" : "Active"}
          statusVariant={isCancelled ? "danger" : "success"}
          acceptanceHeading="Acceptance Criteria (FR-004b)"
          acceptanceCriteria={[
            "Edited fields save to the existing event",
            "Updated details display immediately",
            "Only the event's organizer can edit it",
            "Existing registrations are preserved",
          ]}
        />
      </div>
    );
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

      <main className="event-create-container">{body}</main>
    </div>
  );
}
