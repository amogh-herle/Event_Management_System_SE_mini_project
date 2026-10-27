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

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}
