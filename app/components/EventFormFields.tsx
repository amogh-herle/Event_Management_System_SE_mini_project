"use client";

import {
  AlertIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  MapPinIcon,
  TagIcon,
  UsersIcon,
} from "./icons";

// Shared between the FR-004a create form and the FR-004b edit form — same
// fields, same validation, same markup, so a rule or layout change only
// needs to happen in one place.

export interface EventFormState {
  name: string;
  description: string;
  date: string;
  time: string;
  venue: string;
  category: string;
  capacity: string;
}

export const EVENT_DEFAULT_CATEGORIES = [
  "Technology",
  "Workshops",
  "Hackathons",
  "Cultural",
  "Music",
  "Sports",
  "Academic",
  "Seminars",
];

export function validateEventField(
  field: keyof EventFormState,
  value: string
): string | undefined {
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
    case "capacity": {
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
}

export function validateEventForm(
  form: EventFormState
): Partial<Record<keyof EventFormState, string>> {
  const errors: Partial<Record<keyof EventFormState, string>> = {};
  (Object.keys(form) as (keyof EventFormState)[]).forEach((field) => {
    const err = validateEventField(field, form[field]);
    if (err) errors[field] = err;
  });
  return errors;
}

interface EventFormFieldsProps {
  form: EventFormState;
  touched: Partial<Record<keyof EventFormState, boolean>>;
  fieldErrors: Partial<Record<keyof EventFormState, string>>;
  categoryOptions: string[];
  onChange: (field: keyof EventFormState, value: string) => void;
  onBlur: (field: keyof EventFormState) => void;
}

export function EventFormFields({
  form,
  touched,
  fieldErrors,
  categoryOptions,
  onChange,
  onBlur,
}: EventFormFieldsProps) {
  return (
    <>
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
            onChange={(e) => onChange("name", e.target.value)}
            onBlur={() => onBlur("name")}
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
              onChange={(e) => onChange("category", e.target.value)}
              onBlur={() => onBlur("category")}
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
              onChange={(e) => onChange("capacity", e.target.value)}
              onBlur={() => onBlur("capacity")}
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
              onChange={(e) => onChange("date", e.target.value)}
              onBlur={() => onBlur("date")}
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
              onChange={(e) => onChange("time", e.target.value)}
              onBlur={() => onBlur("time")}
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
            onChange={(e) => onChange("venue", e.target.value)}
            onBlur={() => onBlur("venue")}
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
          onChange={(e) => onChange("description", e.target.value)}
          onBlur={() => onBlur("description")}
          aria-invalid={!!(touched.description && fieldErrors.description)}
          required
        />
        {touched.description && fieldErrors.description && (
          <p className="field-error" role="alert">
            <AlertIcon size={14} /> {fieldErrors.description}
          </p>
        )}
      </div>
    </>
  );
}

interface EventPreviewPanelProps {
  form: EventFormState;
  statusLabel: string;
  statusVariant: "success" | "danger";
  acceptanceCriteria: string[];
  acceptanceHeading: string;
}

export function EventPreviewPanel({
  form,
  statusLabel,
  statusVariant,
  acceptanceCriteria,
  acceptanceHeading,
}: EventPreviewPanelProps) {
  return (
    <aside className="event-preview-column" aria-label="Live Event Preview">
      <div className="preview-sticky-card">
        <div className="preview-header">
          <span className="preview-label">Live Participant Preview</span>
          <span className={`badge badge-${statusVariant}`}>Status: {statusLabel}</span>
        </div>

        <div className="preview-event-card">
          <div className="preview-badge-row">
            <span className="category-pill">{form.category || "General"}</span>
            <span className="capacity-pill">
              <UsersIcon size={13} /> {form.capacity || "—"} seats
            </span>
          </div>

          <h3 className="preview-title">{form.name || "Event Title will appear here"}</h3>

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
          <h4>{acceptanceHeading}</h4>
          <ul>
            {acceptanceCriteria.map((item) => (
              <li key={item}>
                <CheckIcon size={14} /> {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
