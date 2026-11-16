import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type LogSeverity = "INFO" | "WARN" | "ERROR";

interface LogEventInput {
  severity: LogSeverity;
  action: string;
  actorId?: string | null;
  actorRole?: Role | null;
  details?: string;
}

/**
 * Durable, queryable record for admin actions (NFR-004 audit trail) and
 * forced application errors (NFR-007 central logging) — SRSec 6.1/6.2.
 * Never throws: a logging failure must never turn a successful mutation
 * (or an already-failing request) into a different kind of failure, so
 * any write error here is swallowed after a console.error fallback.
 */
export async function logEvent(input: LogEventInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        severity: input.severity,
        action: input.action,
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        details: input.details,
      },
    });
  } catch (err) {
    console.error("[auditLog] failed to write log entry:", input.action, err);
  }
}
