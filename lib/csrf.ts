// SRSec 5.3: state-changing requests must come from this site. Browsers always
// send Origin on cross-site POST/PUT/PATCH/DELETE, so a mismatch with the Host
// the request was addressed to is a forged cross-site request. Requests with
// no Origin (curl, server-side scripts) are not browser CSRF vectors.
const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isCrossSiteRequest(method: string, origin: string | null, host: string | null): boolean {
  if (!STATE_CHANGING.has(method.toUpperCase())) return false;
  if (!origin) return false;
  if (!host) return true;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}
