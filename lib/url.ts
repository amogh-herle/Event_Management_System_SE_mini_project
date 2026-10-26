import os from "os";

// Interface name prefixes that are virtual/bridge adapters, not the
// machine's actual LAN connection (Docker's bridge, veth pairs it creates
// per-container, Linux bridges in general). Node doesn't mark these any
// differently from a real NIC in `internal`, and interface iteration order
// isn't guaranteed — without this, picking "the first non-internal IPv4"
// can just as easily return Docker's 172.17.0.1 as the host's real
// 192.168.x.x/10.x.x.x address, depending on what's running.
const VIRTUAL_IFACE_PREFIXES = ["docker", "veth", "br-", "virbr"];

function getLanIp(): string | null {
  const interfaces = os.networkInterfaces();
  const names = Object.keys(interfaces);

  const candidates = (skipVirtual: boolean) => {
    for (const name of names) {
      if (skipVirtual && VIRTUAL_IFACE_PREFIXES.some((p) => name.startsWith(p))) continue;
      for (const iface of interfaces[name] ?? []) {
        if (iface.family === "IPv4" && !iface.internal) {
          return iface.address;
        }
      }
    }
    return null;
  };

  // Prefer a real adapter; only fall back to a virtual one (still better
  // than nothing) if that's genuinely all this host has.
  return candidates(true) ?? candidates(false);
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
 *
 * Resolved fresh on every call (not cached) — a laptop's LAN IP can change
 * (DHCP lease renewal, switching networks), and this always reflects
 * whatever it is at the moment the email actually goes out.
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
