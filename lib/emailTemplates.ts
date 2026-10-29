export function verificationEmail(name: string, verifyUrl: string) {
  const subject = "Verify your Event Management System account";
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Hi ${escapeHtml(name)},</h2>
      <p>Thanks for signing up. Click the button below to verify your email and activate your account.</p>
      <p style="margin: 24px 0;">
        <a href="${verifyUrl}" style="background:#4b3fd6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
          Verify my email
        </a>
      </p>
      <p>Or paste this link into your browser:<br>${verifyUrl}</p>
      <p style="color:#666;font-size:13px;">This link expires in 24 hours. If you didn't create this account, you can ignore this email.</p>
    </div>
  `;
  return { subject, html };
}

export function passwordResetEmail(name: string, resetUrl: string) {
  const subject = "Reset your Event Management System password";
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Hi ${escapeHtml(name)},</h2>
      <p>We received a request to reset your password. Click the button below to choose a new one.</p>
      <p style="margin: 24px 0;">
        <a href="${resetUrl}" style="background:#4b3fd6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">
          Reset my password
        </a>
      </p>
      <p>Or paste this link into your browser:<br>${resetUrl}</p>
      <p style="color:#666;font-size:13px;">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email — your password won't change.</p>
    </div>
  `;
  return { subject, html };
}

export function waitlistPromotionEmail(name: string, eventName: string, eventDate?: Date | string) {
  const subject = `Seat Confirmed: You've been promoted from the waitlist for ${eventName}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Great news, ${escapeHtml(name)}!</h2>
      <p>A seat has become available and you have been automatically promoted from the waitlist to <strong>confirmed</strong> for <strong>${escapeHtml(eventName)}</strong>.</p>
      ${eventDate ? `<p><strong>Date:</strong> ${new Date(eventDate).toLocaleDateString()}</p>` : ""}
      <p>Your registration is now active and your seat is reserved. We look forward to seeing you there!</p>
    </div>
  `;
  return { subject, html };
}

export function registrationConfirmationEmail(
  name: string,
  eventName: string,
  eventDate?: Date | string,
  eventTime?: string,
  eventVenue?: string
) {
  const subject = `Registration Confirmed: ${eventName}`;
  const formattedDate = eventDate ? new Date(eventDate).toLocaleDateString() : "";
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>You're registered, ${escapeHtml(name)}!</h2>
      <p>Your registration for <strong>${escapeHtml(eventName)}</strong> has been confirmed.</p>
      ${formattedDate ? `<p><strong>Date:</strong> ${formattedDate}</p>` : ""}
      ${eventTime ? `<p><strong>Time:</strong> ${escapeHtml(eventTime)}</p>` : ""}
      ${eventVenue ? `<p><strong>Venue:</strong> ${escapeHtml(eventVenue)}</p>` : ""}
      <p>Your seat is confirmed and reserved. We look forward to seeing you there!</p>
    </div>
  `;
  return { subject, html };
}

export function registrationCancellationEmail(
  name: string,
  eventName: string,
  eventDate?: Date | string
) {
  const subject = `Registration Cancelled: ${eventName}`;
  const formattedDate = eventDate ? new Date(eventDate).toLocaleDateString() : "";
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Registration Cancelled</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Your registration for <strong>${escapeHtml(eventName)}</strong> has been cancelled.</p>
      ${formattedDate ? `<p><strong>Date:</strong> ${formattedDate}</p>` : ""}
      <p>Your reserved seat has been released. If this was a mistake, you can re-register from the events directory while seats remain available.</p>
    </div>
  `;
  return { subject, html };
}

export function eventReminderEmail(
  name: string,
  eventName: string,
  eventDate: Date | string,
  eventTime?: string,
  eventVenue?: string
) {
  const subject = `Reminder: ${eventName} is coming up`;
  const formattedDate = new Date(eventDate).toLocaleDateString();
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Upcoming Event Reminder</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>This is a friendly reminder that you are registered for <strong>${escapeHtml(eventName)}</strong>.</p>
      <p><strong>Date:</strong> ${formattedDate}</p>
      ${eventTime ? `<p><strong>Time:</strong> ${escapeHtml(eventTime)}</p>` : ""}
      ${eventVenue ? `<p><strong>Venue:</strong> ${escapeHtml(eventVenue)}</p>` : ""}
      <p>We look forward to seeing you there!</p>
    </div>
  `;
  return { subject, html };
}

// FR-005b: sent to every registered/waitlisted participant when the
// organizer cancels the event.
export function eventCancelledEmail(
  name: string,
  eventName: string,
  eventDate?: Date | string,
  eventTime?: string,
  eventVenue?: string
) {
  const subject = `Event Cancelled: ${eventName}`;
  const formattedDate = eventDate ? new Date(eventDate).toLocaleDateString() : "";
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Event Cancelled</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>We're sorry to let you know that <strong>${escapeHtml(eventName)}</strong>, which you registered for, has been cancelled by the organizer.</p>
      ${formattedDate ? `<p><strong>Date:</strong> ${formattedDate}</p>` : ""}
      ${eventTime ? `<p><strong>Time:</strong> ${escapeHtml(eventTime)}</p>` : ""}
      ${eventVenue ? `<p><strong>Venue:</strong> ${escapeHtml(eventVenue)}</p>` : ""}
      <p>The event will no longer take place, so please don't plan to attend. You can browse other upcoming events from the events directory.</p>
    </div>
  `;
  return { subject, html };
}

export interface EventChangeLine {
  label: string;
  before?: string;
  after: string;
}

// FR-005b: sent to every registered/waitlisted participant when the
// organizer edits participant-facing event details (FR-004b).
export function eventUpdatedEmail(
  name: string,
  eventName: string,
  changes: EventChangeLine[],
  eventDate?: Date | string,
  eventTime?: string,
  eventVenue?: string
) {
  const subject = `Event Updated: ${eventName}`;
  const formattedDate = eventDate ? new Date(eventDate).toLocaleDateString() : "";
  const changeItems = changes
    .map((c) =>
      c.before !== undefined
        ? `<li><strong>${escapeHtml(c.label)}:</strong> ${escapeHtml(c.before)} &rarr; ${escapeHtml(c.after)}</li>`
        : `<li><strong>${escapeHtml(c.label)}:</strong> ${escapeHtml(c.after)}</li>`
    )
    .join("");
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Event Details Updated</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>The organizer has updated <strong>${escapeHtml(eventName)}</strong>, which you registered for. Here's what changed:</p>
      <ul>${changeItems}</ul>
      <p>Current details:</p>
      ${formattedDate ? `<p><strong>Date:</strong> ${formattedDate}</p>` : ""}
      ${eventTime ? `<p><strong>Time:</strong> ${escapeHtml(eventTime)}</p>` : ""}
      ${eventVenue ? `<p><strong>Venue:</strong> ${escapeHtml(eventVenue)}</p>` : ""}
      <p>Your registration is unchanged. We look forward to seeing you there!</p>
    </div>
  `;
  return { subject, html };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}
