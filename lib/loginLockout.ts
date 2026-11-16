// NFR-004 / SRSec 2.3: lock the account after 5 consecutive failed logins.
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
export const ACCOUNT_LOCKED_ERROR = "Account locked after too many failed attempts. Try again later.";

export function isLocked(lockedUntil: Date | null | undefined, now: number = Date.now()): boolean {
  return !!lockedUntil && lockedUntil.getTime() > now;
}

export interface FailureState {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  locked: boolean;
}

export function nextFailureState(previousAttempts: number, now: number = Date.now()): FailureState {
  const attempts = previousAttempts + 1;
  if (attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
    return { failedLoginAttempts: 0, lockedUntil: new Date(now + LOCKOUT_DURATION_MS), locked: true };
  }
  return { failedLoginAttempts: attempts, lockedUntil: null, locked: false };
}
