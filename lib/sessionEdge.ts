// Edge-runtime-safe (Web Crypto) session verification and sliding renewal for
// middleware.ts. Cookie format matches lib/session.ts: userId.expiresAt.hmac.
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function renewSessionValue(
  cookieValue: string,
  secret: string,
  now: number = Date.now()
): Promise<string | null> {
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAtStr, signature] = parts;
  const expected = await hmacHex(secret, `${userId}.${expiresAtStr}`);
  if (expected.length !== signature.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (diff !== 0) return null;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt < now) return null;

  const payload = `${userId}.${now + SESSION_IDLE_TIMEOUT_MS}`;
  return `${payload}.${await hmacHex(secret, payload)}`;
}
