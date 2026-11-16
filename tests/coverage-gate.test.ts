import test from "node:test";
import assert from "node:assert/strict";
import {
  CORE_MODULES,
  LINE_THRESHOLD,
  parseLcov,
  checkCoverage,
  percent,
} from "../scripts/check-core-coverage";

// NFR-007: the CI coverage gate must fail when a core module is below 80%.

function lcovFor(entries: Record<string, [found: number, hit: number]>): string {
  return Object.entries(entries)
    .map(([file, [found, hit]]) => `TN:\nSF:${file}\nLF:${found}\nLH:${hit}\nend_of_record`)
    .join("\n");
}

function allCoreAt(found: number, hit: number): Record<string, [number, number]> {
  return Object.fromEntries(CORE_MODULES.map((f) => [f, [found, hit] as [number, number]]));
}

test("NFR-007 gate: the SRS threshold is 80% line coverage", () => {
  assert.equal(LINE_THRESHOLD, 80);
  assert.ok(CORE_MODULES.includes("lib/registration.ts"));
  assert.ok(CORE_MODULES.includes("lib/logger.ts"));
});

test("NFR-007 gate: parses lcov records, with absolute or relative paths and CRLF line endings", () => {
  const root = "/repo";
  const files = parseLcov(
    "SF:/repo/lib/mailer.ts\r\nLF:10\r\nLH:9\r\nend_of_record\nSF:lib/logger.ts\nLF:4\nLH:4\nend_of_record\n",
    root
  );
  assert.deepEqual(files.get("lib/mailer.ts"), { file: "lib/mailer.ts", linesFound: 10, linesHit: 9 });
  assert.equal(files.get("lib/logger.ts")?.linesHit, 4);
});

test("NFR-007 gate: passes when every core module is at or above 80%", () => {
  const result = checkCoverage(parseLcov(lcovFor(allCoreAt(100, 80)), "/"));
  assert.equal(result.ok, true);
  assert.equal(result.total, 80);
});

test("NFR-007 gate: fails when a single core module is below 80%, even if the total passes", () => {
  const entries = allCoreAt(100, 95);
  entries["lib/mailer.ts"] = [100, 79];
  const result = checkCoverage(parseLcov(lcovFor(entries), "/"));
  assert.ok(result.total >= 80);
  assert.equal(result.ok, false);
  assert.deepEqual(result.rows.filter((r) => !r.ok).map((r) => r.file), ["lib/mailer.ts"]);
});

test("NFR-007 gate: fails when a core module is missing from the report", () => {
  const entries = allCoreAt(100, 100);
  delete entries["app/api/reminders/route.ts"];
  const result = checkCoverage(parseLcov(lcovFor(entries), "/"));
  assert.equal(result.ok, false);
});

test("NFR-007 gate: an empty file counts as fully covered", () => {
  assert.equal(percent(0, 0), 100);
  assert.equal(percent(1, 4), 25);
});
