import Link from "next/link";
import { AuthShell } from "../../components/AuthShell";
import { CheckIcon, MailIcon } from "../../components/icons";
import { ResendButton } from "./ResendButton";

export default function PendingVerificationPage({
  searchParams,
}: {
  searchParams: { email?: string };
}) {
  const email = typeof searchParams.email === "string" ? searchParams.email : "";

  return (
    <AuthShell topRight={<span>Step 2 of 2</span>}>
      <div className="status-card">
        <div className="status-icon" aria-hidden="true">
          <MailIcon size={40} />
          <span className="badge"><CheckIcon size={16} /></span>
        </div>

        <h1>Check your inbox</h1>
        <p className="lede" style={{ marginBottom: 12 }}>
          Your account was created. We&apos;ve sent a verification link to
        </p>
        <p style={{ margin: "0 0 4px" }}>
          <span className="email-pill">{email || "your email address"}</span>
        </p>
      </div>

      <ol className="steps" aria-label="What happens next">
        <li data-done="true">
          <span className="step-num" aria-hidden="true"><CheckIcon size={16} /></span>
          <div>
            <strong>Account created</strong>
            <small>Your details are saved. The account stays inactive until verified.</small>
          </div>
        </li>
        <li>
          <span className="step-num" aria-hidden="true">2</span>
          <div>
            <strong>Open the email &amp; click the link</strong>
            <small>It can take a minute to arrive. Check spam or promotions too.</small>
          </div>
        </li>
        <li>
          <span className="step-num" aria-hidden="true">3</span>
          <div>
            <strong>Start registering for events</strong>
            <small>Once verified, you can log in and save your seat.</small>
          </div>
        </li>
      </ol>

      <div className="actions">
        <ResendButton email={email} />
        <Link href="/signup" className="btn btn-ghost btn-block">
          Use a different email
        </Link>
      </div>
    </AuthShell>
  );
}
