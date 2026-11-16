import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  logger,
  log,
  getRecentLogs,
  clearRecentLogs,
  addLogSink,
  serializeError,
  MAX_RECENT_LOGS,
  type LogEntry,
} from "../lib/logger";
import { GET as eventsRouteGet } from "../app/api/events/route";
import { notifyEventParticipants } from "../lib/registration";
import { prisma } from "../lib/prisma";

// NFR-007 (Maintainability): application errors are logged centrally with a
// timestamp and severity. Pass condition from the SRS: "A forced error
// appears in the central log with timestamp and severity".

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

test.beforeEach(() => {
  clearRecentLogs();
  delete process.env.LOG_LEVEL;
  delete process.env.LOG_FILE;
});

// --- Entry format ---

test("NFR-007: an error entry carries timestamp, severity, source, message and error details", () => {
  const entry = logger.error("unit", "something broke", new TypeError("bad input"), { eventId: "evt_1" });

  assert.ok(entry);
  assert.match(entry.timestamp, ISO_TIMESTAMP);
  assert.equal(entry.severity, "ERROR");
  assert.equal(entry.source, "unit");
  assert.equal(entry.message, "something broke");
  assert.equal(entry.error?.name, "TypeError");
  assert.equal(entry.error?.message, "bad input");
  assert.ok(entry.error?.stack?.includes("bad input"));
  assert.deepEqual(entry.context, { eventId: "evt_1" });
  assert.deepEqual(getRecentLogs(), [entry]);
});

test("NFR-007: every severity level is recorded with its own label", () => {
  process.env.LOG_LEVEL = "DEBUG";
  logger.debug("unit", "d");
  logger.info("unit", "i", { a: 1 });
  logger.warn("unit", "w");
  logger.error("unit", "e");
  assert.deepEqual(
    getRecentLogs().map((e) => e.severity),
    ["DEBUG", "INFO", "WARN", "ERROR"]
  );
});

test("NFR-007: each entry is written to the server console as one JSON line", (t) => {
  const errLines: string[] = [];
  const outLines: string[] = [];
  t.mock.method(console, "error", (line: string) => errLines.push(line));
  t.mock.method(console, "log", (line: string) => outLines.push(line));

  logger.error("unit", "to stderr");
  logger.warn("unit", "also to stderr");
  logger.info("unit", "to stdout");

  assert.equal(errLines.length, 2);
  assert.equal(outLines.length, 1);
  const parsed = JSON.parse(errLines[0]) as LogEntry;
  assert.equal(parsed.severity, "ERROR");
  assert.equal(parsed.message, "to stderr");
  assert.match(parsed.timestamp, ISO_TIMESTAMP);
  assert.equal(JSON.parse(outLines[0]).severity, "INFO");
});

test("NFR-007: LOG_LEVEL filters out entries below the minimum severity", () => {
  assert.equal(logger.debug("unit", "hidden by default"), null);

  process.env.LOG_LEVEL = "warn";
  assert.equal(logger.info("unit", "hidden"), null);
  assert.ok(logger.warn("unit", "shown"));

  process.env.LOG_LEVEL = "nonsense";
  assert.ok(logger.info("unit", "invalid LOG_LEVEL falls back to INFO"));
  assert.deepEqual(
    getRecentLogs().map((e) => e.message),
    ["shown", "invalid LOG_LEVEL falls back to INFO"]
  );
});

test("NFR-007: anything thrown is serialised safely", () => {
  assert.deepEqual(serializeError("plain string"), { name: "Error", message: "plain string" });
  assert.deepEqual(serializeError({ code: 42 }), { name: "NonErrorThrown", message: '{"code":42}' });
  assert.deepEqual(serializeError(undefined), { name: "NonErrorThrown", message: "undefined" });

  const circular: any = {};
  circular.self = circular;
  assert.deepEqual(serializeError(circular), { name: "NonErrorThrown", message: "[object Object]" });

  // Context-free calls omit the optional fields entirely.
  const entry = log("ERROR", "unit", "no extras");
  assert.ok(entry);
  assert.equal("error" in entry, false);
  assert.equal("context" in entry, false);
});

test("NFR-007: LOG_FILE appends every entry to a central log file", () => {
  const dir = mkdtempSync(join(tmpdir(), "ems-log-"));
  try {
    const file = join(dir, "app.log");
    process.env.LOG_FILE = file;
    logger.error("unit", "first", new Error("boom"));
    logger.warn("unit", "second");

    const lines = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(lines.length, 2);
    assert.equal(lines[0].severity, "ERROR");
    assert.equal(lines[0].error.message, "boom");
    assert.match(lines[0].timestamp, ISO_TIMESTAMP);
    assert.equal(lines[1].severity, "WARN");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("NFR-007: an unwritable LOG_FILE never breaks the caller", (t) => {
  const errLines: string[] = [];
  t.mock.method(console, "error", (line: string) => errLines.push(line));
  process.env.LOG_FILE = join(tmpdir(), "ems-missing-dir", "nested", "app.log");

  assert.doesNotThrow(() => logger.error("unit", "still logged"));
  assert.equal(getRecentLogs().length, 1);
  assert.ok(errLines.some((l) => JSON.parse(l).message.startsWith("could not write to LOG_FILE")));
});

test("NFR-007: extra sinks receive entries, can unsubscribe, and cannot break logging", () => {
  const seen: string[] = [];
  const stop = addLogSink((e) => seen.push(e.message));
  const stopBroken = addLogSink(() => {
    throw new Error("sink failure");
  });

  logger.error("unit", "one");
  stop();
  stopBroken();
  logger.error("unit", "two");

  assert.deepEqual(seen, ["one"]);
  assert.equal(getRecentLogs().length, 2);
});

test("NFR-007: the in-memory buffer keeps only the most recent entries", () => {
  for (let i = 0; i < MAX_RECENT_LOGS + 5; i++) logger.info("unit", `entry ${i}`);
  const recent = getRecentLogs();
  assert.equal(recent.length, MAX_RECENT_LOGS);
  assert.equal(recent[0].message, "entry 5");
  assert.equal(recent[recent.length - 1].message, `entry ${MAX_RECENT_LOGS + 4}`);
});

// --- SRS pass condition: a forced error appears in the central log ---

test("NFR-007: a forced database error in GET /api/events appears in the central log", async () => {
  const original = (prisma as any).event;
  (prisma as any).event = {
    findMany: async () => {
      throw new Error("forced database failure");
    },
  };
  try {
    const res = await eventsRouteGet(new Request("http://localhost:3000/api/events"));
    assert.equal(res.status, 500);
  } finally {
    (prisma as any).event = original;
  }

  const entry = getRecentLogs().find((e) => e.source === "events");
  assert.ok(entry, "the forced error must be in the central log");
  assert.equal(entry.severity, "ERROR");
  assert.match(entry.timestamp, ISO_TIMESTAMP);
  assert.equal(entry.message, "failed to list events");
  assert.equal(entry.error?.message, "forced database failure");
});

test("NFR-007: a forced failure in participant notifications (core logic) appears in the central log", async () => {
  const failingDb: any = {
    registration: {
      findMany: async () => {
        throw new Error("forced lookup failure");
      },
    },
  };

  const result = await notifyEventParticipants(
    { kind: "CANCELLATION", event: { id: "evt_forced", name: "Forced Event" } as any },
    failingDb
  );
  assert.deepEqual(result, { recipients: 0, sent: 0, failed: 0 });

  const entry = getRecentLogs().find((e) => e.source === "notifications");
  assert.ok(entry, "the forced error must be in the central log");
  assert.equal(entry.severity, "ERROR");
  assert.match(entry.timestamp, ISO_TIMESTAMP);
  assert.equal(entry.message, "failed to load participants for event evt_forced");
  assert.equal(entry.error?.message, "forced lookup failure");
});
