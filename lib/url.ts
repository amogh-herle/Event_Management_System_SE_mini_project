import os from "os";

function getLanIp(): string | null {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

/**
 * Resolves the origin to embed in outbound emails (verification,
 * password reset).
 *
 * Prefers an explicit PUBLIC_APP_ORIGIN override (set this in production —
 * LAN-IP autodetection below is a local-dev convenience, not something to
 * rely on behind a real domain/load balancer). Otherwise, if the request
 * came in on localhost/127.0.0.1 (e.g. `next dev` opened from the same
 * machine), swaps that for the host's own LAN IP so a link emailed during
 * local testing still resolves when opened from another device — a raw
 * "localhost" link would otherwise point at that *other* device's own
 * loopback, not this server.
 */
export function getPublicOrigin(request: Request): string {
  const envOverride = process.env.PUBLIC_APP_ORIGIN;
  if (envOverride) return envOverride.replace(/\/+$/, "");

  const url = new URL(request.url);
  const isLocal =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "0.0.0.0" ||
    url.hostname === "::1";

  if (isLocal) {
    const ip = getLanIp();
    if (ip) {
      return `${url.protocol}//${ip}${url.port ? `:${url.port}` : ""}`;
    }
  }

  return url.origin;
}
