import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

/**
 * NFR-007 coverage gate. Reads an lcov report produced by the test run and
 * fails (exit code 1) unless every core business-logic module named by the
 * SRS (registration, capacity check, waitlist promotion, notifications)
 * and the central logger each have at least 80% line coverage, and the
 * core modules together do too.
 *
 * Usage: tsx scripts/check-core-coverage.ts [path/to/lcov.info]
 */

export const CORE_MODULES = [
  "lib/registration.ts", // registration, capacity check, waitlist promotion, notifications
  "lib/mailer.ts", // notification delivery
  "lib/emailTemplates.ts", // notification content
  "lib/logger.ts", // NFR-007 central error log
  "app/api/events/[id]/register/route.ts",
  "app/api/events/[id]/waitlist/route.ts",
  "app/api/registrations/route.ts",
  "app/api/reminders/route.ts",
];

export const LINE_THRESHOLD = 80;

export interface FileCoverage {
  file: string;
  linesFound: number;
  linesHit: number;
}

export function parseLcov(text: string, root: string): Map<string, FileCoverage> {
  const files = new Map<string, FileCoverage>();
  let current: FileCoverage | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("SF:")) {
      const file = relative(root, resolve(root, line.slice(3))).split("\\").join("/");
      current = { file, linesFound: 0, linesHit: 0 };
    } else if (current && line.startsWith("LF:")) {
      current.linesFound = Number(line.slice(3));
    } else if (current && line.startsWith("LH:")) {
      current.linesHit = Number(line.slice(3));
    } else if (current && line === "end_of_record") {
      files.set(current.file, current);
      current = null;
    }
  }
  return files;
}

export function percent(hit: number, found: number): number {
  return found === 0 ? 100 : (hit / found) * 100;
}

export function checkCoverage(files: Map<string, FileCoverage>) {
  const rows = CORE_MODULES.map((file) => {
    const cov = files.get(file);
    const pct = cov ? percent(cov.linesHit, cov.linesFound) : 0;
    return { file, cov, pct, ok: Boolean(cov) && pct >= LINE_THRESHOLD };
  });
  const found = rows.reduce((n, r) => n + (r.cov?.linesFound ?? 0), 0);
  const hit = rows.reduce((n, r) => n + (r.cov?.linesHit ?? 0), 0);
  const total = percent(hit, found);
  return { rows, found, hit, total, ok: rows.every((r) => r.ok) && total >= LINE_THRESHOLD };
}

function main() {
  const lcovPath = process.argv[2] ?? "coverage/lcov.info";
  let lcov: string;
  try {
    lcov = readFileSync(lcovPath, "utf8");
  } catch {
    console.error(`NFR-007 coverage gate: no coverage report at ${lcovPath}. Run the tests with the lcov reporter first.`);
    process.exit(1);
  }
  const result = checkCoverage(parseLcov(lcov, process.cwd()));

  console.log(`NFR-007 core-module line coverage (threshold ${LINE_THRESHOLD}%)`);
  for (const r of result.rows) {
    const detail = r.cov ? `${r.cov.linesHit}/${r.cov.linesFound}` : "not in report";
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.pct.toFixed(2).padStart(6)}%  ${detail.padEnd(13)} ${r.file}`);
  }
  console.log(
    `  ${result.total >= LINE_THRESHOLD ? "PASS" : "FAIL"}  ${result.total.toFixed(2).padStart(6)}%  ` +
      `${`${result.hit}/${result.found}`.padEnd(13)} core modules combined`
  );

  if (!result.ok) {
    console.error(`\nNFR-007 coverage gate failed: core modules must each have >= ${LINE_THRESHOLD}% line coverage.`);
    process.exit(1);
  }
  console.log("\nNFR-007 coverage gate passed.");
}

if (require.main === module) main();
