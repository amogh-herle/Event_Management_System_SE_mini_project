import { appendFileSync } from "node:fs";

/**
 * NFR-007 (Maintainability): central application logger.
 *
 * Every server-side log line in the app goes through this module, so all
 * errors end up in one place, in one format, with a timestamp and a
 * severity. Each entry is written as a single JSON line:
 *
 *   {"timestamp":"2026-11-07T10:15:30.123Z","severity":"ERROR",
 *    "source":"events/:id","message":"failed to update event",
 *    "error":{"name":"Error","message":"...","stack":"..."},
 *    "context":{"eventId":"evt_1"}}
 *
 * Where entries go:
 *  - the server console (stderr for WARN/ERROR, stdout otherwise). On
 *    Vercel this is the project's Runtime Logs, the central log in
 *    production; locally it is the `npm run dev` terminal.
 *  - additionally, the file named by LOG_FILE when that env var is set
 *    (e.g. LOG_FILE=logs/app.log for a persistent local log).
 *  - an in-memory buffer of the most recent entries (getRecentLogs), used
 *    by the test suite to verify that a forced error is logged.
 *
 * LOG_LEVEL (DEBUG | INFO | WARN | ERROR, default INFO) sets the minimum
 * severity that is recorded.
 */

export type LogSeverity = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LoggedError {
  name: string;
  message: string;
  stack?: string;
}

export interface LogEntry {
  timestamp: string;
  severity: LogSeverity;
  source: string;
  message: string;
  error?: LoggedError;
  context?: Record<string, unknown>;
}

export type LogSink = (entry: LogEntry) => void;

const SEVERITY_RANK: Record<LogSeverity, number> = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
};

export const MAX_RECENT_LOGS = 200;
const recent: LogEntry[] = [];
const extraSinks = new Set<LogSink>();

function minimumSeverity(): LogSeverity {
  const configured = (process.env.LOG_LEVEL || "").toUpperCase();
  return configured in SEVERITY_RANK ? (configured as LogSeverity) : "INFO";
}

/** Normalises anything that was thrown into a plain, JSON-safe object. */
export function serializeError(err: unknown): LoggedError {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  if (typeof err === "string") {
    return { name: "Error", message: err };
  }
  let message: string;
  try {
    message = JSON.stringify(err) ?? String(err);
  } catch {
    message = String(err);
  }
  return { name: "NonErrorThrown", message };
}

function consoleSink(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  if (entry.severity === "ERROR" || entry.severity === "WARN") {
    console.error(line);
  } else {
    console.log(line);
  }
}

function fileSink(entry: LogEntry): void {
  const file = process.env.LOG_FILE;
  if (!file) return;
  try {
    appendFileSync(file, JSON.stringify(entry) + "\n");
  } catch (err) {
    // Never let a broken log file take a request down with it.
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        severity: "WARN",
        source: "logger",
        message: `could not write to LOG_FILE ${file}`,
        error: serializeError(err),
      })
    );
  }
}

export function log(
  severity: LogSeverity,
  source: string,
  message: string,
  error?: unknown,
  context?: Record<string, unknown>
): LogEntry | null {
  if (SEVERITY_RANK[severity] < SEVERITY_RANK[minimumSeverity()]) return null;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    severity,
    source,
    message,
  };
  if (error !== undefined) entry.error = serializeError(error);
  if (context && Object.keys(context).length > 0) entry.context = context;

  recent.push(entry);
  if (recent.length > MAX_RECENT_LOGS) recent.shift();

  consoleSink(entry);
  fileSink(entry);
  for (const sink of extraSinks) {
    try {
      sink(entry);
    } catch {
      // A failing extra sink must not break logging for everyone else.
    }
  }
  return entry;
}

export const logger = {
  debug: (source: string, message: string, context?: Record<string, unknown>) =>
    log("DEBUG", source, message, undefined, context),
  info: (source: string, message: string, context?: Record<string, unknown>) =>
    log("INFO", source, message, undefined, context),
  warn: (source: string, message: string, error?: unknown, context?: Record<string, unknown>) =>
    log("WARN", source, message, error, context),
  error: (source: string, message: string, error?: unknown, context?: Record<string, unknown>) =>
    log("ERROR", source, message, error, context),
};

/** Most recent entries, oldest first (a copy; at most MAX_RECENT_LOGS). */
export function getRecentLogs(): LogEntry[] {
  return [...recent];
}

export function clearRecentLogs(): void {
  recent.length = 0;
}

/** Registers an extra destination for log entries; returns an unsubscribe function. */
export function addLogSink(sink: LogSink): () => void {
  extraSinks.add(sink);
  return () => {
    extraSinks.delete(sink);
  };
}
