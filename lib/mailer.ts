import nodemailer, { type Transporter } from "nodemailer";

let transporterPromise: Promise<Transporter> | null = null;

/**
 * Gmail SMTP in any env with EMAIL_USER/EMAIL_PASS set (an App Password,
 * not the account password). Falls back to a disposable Ethereal test
 * inbox when those aren't set, so the flow is runnable without real
 * credentials — the console logs a preview URL for the sent mail.
 */
function getTransporter(): Promise<Transporter> {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      return nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });
    }

    const testAccount = await nodemailer.createTestAccount();
    console.warn(
      "[mailer] EMAIL_USER/EMAIL_PASS not set — using a disposable Ethereal test inbox. " +
        "Sent mail will NOT reach a real address; a preview URL is logged for each send."
    );
    return nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  })();

  return transporterPromise;
}

export async function sendMail(to: string, subject: string, html: string) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: '"Event Management System" <no-reply@event-management-system.local>',
    to,
    subject,
    html,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`[mailer] preview: ${previewUrl}`);
  }

  return info;
}
