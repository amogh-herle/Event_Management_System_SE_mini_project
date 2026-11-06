import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  verificationEmail,
  passwordResetEmail,
  waitlistPromotionEmail,
  registrationConfirmationEmail,
  registrationCancellationEmail,
  eventReminderEmail,
  eventCancelledEmail,
  eventUpdatedEmail,
} from "../lib/emailTemplates";

describe("lib/emailTemplates.ts", () => {
  test("verificationEmail includes the verify link and escapes the name", () => {
    const { subject, html } = verificationEmail("<Bob>", "https://example.com/verify?t=abc");
    assert.match(subject, /Verify your Event Management System account/);
    assert.match(html, /https:\/\/example\.com\/verify\?t=abc/);
    assert.match(html, /&lt;Bob&gt;/);
    assert.doesNotMatch(html, /<Bob>/);
  });

  test("passwordResetEmail includes the reset link and escapes the name", () => {
    const { subject, html } = passwordResetEmail("O'Brien", "https://example.com/reset?t=xyz");
    assert.match(subject, /Reset your Event Management System password/);
    assert.match(html, /https:\/\/example\.com\/reset\?t=xyz/);
    assert.match(html, /O&#39;Brien/);
  });

  test("waitlistPromotionEmail renders the date line when a date is given", () => {
    const { subject, html } = waitlistPromotionEmail("Amogh", "Hack Night", "2026-01-15T00:00:00.000Z");
    assert.match(subject, /Seat Confirmed/);
    assert.match(html, /<strong>Date:<\/strong>/);
  });

  test("waitlistPromotionEmail omits the date line when no date is given", () => {
    const { html } = waitlistPromotionEmail("Amogh", "Hack Night");
    assert.doesNotMatch(html, /<strong>Date:<\/strong>/);
  });

  test("registrationConfirmationEmail renders date, time and venue when all provided", () => {
    const { subject, html } = registrationConfirmationEmail(
      "Amogh",
      "Hack Night",
      "2026-01-15T00:00:00.000Z",
      "6 PM",
      "Main Hall"
    );
    assert.match(subject, /Registration Confirmed: Hack Night/);
    assert.match(html, /<strong>Date:<\/strong>/);
    assert.match(html, /<strong>Time:<\/strong> 6 PM/);
    assert.match(html, /<strong>Venue:<\/strong> Main Hall/);
  });

  test("registrationConfirmationEmail omits date, time and venue when absent", () => {
    const { html } = registrationConfirmationEmail("Amogh", "Hack Night");
    assert.doesNotMatch(html, /<strong>Date:<\/strong>/);
    assert.doesNotMatch(html, /<strong>Time:<\/strong>/);
    assert.doesNotMatch(html, /<strong>Venue:<\/strong>/);
  });

  test("registrationCancellationEmail renders the date line when given", () => {
    const { subject, html } = registrationCancellationEmail("Amogh", "Hack Night", "2026-01-15T00:00:00.000Z");
    assert.match(subject, /Registration Cancelled: Hack Night/);
    assert.match(html, /<strong>Date:<\/strong>/);
  });

  test("registrationCancellationEmail omits the date line when absent", () => {
    const { html } = registrationCancellationEmail("Amogh", "Hack Night");
    assert.doesNotMatch(html, /<strong>Date:<\/strong>/);
  });

  test("eventReminderEmail always renders the date and optionally time/venue", () => {
    const full = eventReminderEmail("Amogh", "Hack Night", "2026-01-15T00:00:00.000Z", "6 PM", "Main Hall");
    assert.match(full.html, /<strong>Time:<\/strong> 6 PM/);
    assert.match(full.html, /<strong>Venue:<\/strong> Main Hall/);

    const minimal = eventReminderEmail("Amogh", "Hack Night", "2026-01-15T00:00:00.000Z");
    assert.doesNotMatch(minimal.html, /<strong>Time:<\/strong>/);
    assert.doesNotMatch(minimal.html, /<strong>Venue:<\/strong>/);
  });

  test("eventCancelledEmail renders all optional fields when provided and omits them otherwise", () => {
    const full = eventCancelledEmail("Amogh", "Hack Night", "2026-01-15T00:00:00.000Z", "6 PM", "Main Hall");
    assert.match(full.subject, /Event Cancelled: Hack Night/);
    assert.match(full.html, /<strong>Date:<\/strong>/);
    assert.match(full.html, /<strong>Time:<\/strong> 6 PM/);
    assert.match(full.html, /<strong>Venue:<\/strong> Main Hall/);

    const minimal = eventCancelledEmail("Amogh", "Hack Night");
    assert.doesNotMatch(minimal.html, /<strong>Date:<\/strong>/);
    assert.doesNotMatch(minimal.html, /<strong>Time:<\/strong>/);
    assert.doesNotMatch(minimal.html, /<strong>Venue:<\/strong>/);
  });

  test("eventUpdatedEmail renders a before -> after line for changed fields", () => {
    const { subject, html } = eventUpdatedEmail(
      "Amogh",
      "Hack Night",
      [{ label: "Venue", before: "Room A", after: "Room B" }],
      "2026-01-15T00:00:00.000Z",
      "6 PM",
      "Room B"
    );
    assert.match(subject, /Event Updated: Hack Night/);
    assert.match(html, /Room A &rarr; Room B/);
    assert.match(html, /<strong>Time:<\/strong> 6 PM/);
    assert.match(html, /<strong>Venue:<\/strong> Room B/);
  });

  test("eventUpdatedEmail renders a single-value line for added fields with no before value", () => {
    const { html } = eventUpdatedEmail("Amogh", "Hack Night", [{ label: "Capacity", after: "50" }]);
    assert.match(html, /<li><strong>Capacity:<\/strong> 50<\/li>/);
    assert.doesNotMatch(html, /&rarr;/);
  });
});
