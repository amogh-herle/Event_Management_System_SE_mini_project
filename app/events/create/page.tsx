"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "../../components/AuthShell";
import { RoleSwitcher } from "../../components/RoleSwitcher";
import { useSessionRole, type RoleType } from "@/lib/useSessionRole";
import { AlertIcon, ArrowRightIcon, CheckIcon, PlusIcon, ShieldIcon } from "../../components/icons";
import {
  EventFormFields,
  EventPreviewPanel,
  EVENT_DEFAULT_CATEGORIES,
  validateEventField,
  validateEventForm,
  type EventFormState as FormState,
} from "../../components/EventFormFields";

const INITIAL_FORM: FormState = {
  name: "",
  description: "",
  date: "",
  time: "",
  venue: "",
  category: "Technology",
  capacity: "",
};

export default function CreateEventPage() {
  const router = useRouter();
  const [role, setRole] = useSessionRole();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [categories, setCategories] = useState<string[]>(EVENT_DEFAULT_CATEGORIES);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [createdEvent, setCreatedEvent] = useState<{ id: string; name: string } | null>(null);

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

  const categoryOptions =
    form.category && !categories.includes(form.category)
      ? [form.category, ...categories]
      : categories;

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
                <EventFormFields
                  form={form}
                  touched={touched}
                  fieldErrors={fieldErrors}
                  categoryOptions={categoryOptions}
                  onChange={handleChange}
                  onBlur={handleBlur}
                />

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

            <EventPreviewPanel
              form={form}
              statusLabel="Active"
              statusVariant="success"
              acceptanceHeading="Acceptance Criteria (FR-004a)"
              acceptanceCriteria={[
                "All 7 required fields stored on creation",
                "Empty required fields rejected with 400",
                "Capacity strictly verified as positive integer",
                "Non-organizers restricted from event creation",
              ]}
            />
          </div>
        )}
      </main>
    </div>
  );
}
