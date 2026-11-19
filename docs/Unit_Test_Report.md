# Unit Test Report

- **Project:** Event Management System (EMS)
- **Execution date:** 19 November 2026
- **Result:** **PASS — 320 of 320 tests passed**
- **Runtime:** Node.js 22, TypeScript, `node:test` run through `tsx`, local PostgreSQL 16

## Test results

| Test module | Tests | Passed | Failed / errors |
|---|---:|---:|---:|
| `accessibility.test.ts` | 8 | 8 | 0 |
| `admin-categories.test.ts` | 20 | 20 | 0 |
| `admin-stats.test.ts` | 9 | 9 | 0 |
| `api-routes.test.ts` | 50 | 50 | 0 |
| `coverage-gate.test.ts` | 6 | 6 | 0 |
| `email-templates.test.ts` | 12 | 12 | 0 |
| `event-edit.test.ts` | 21 | 21 | 0 |
| `event-notifications.test.ts` | 25 | 25 | 0 |
| `event-search.test.ts` | 21 | 21 | 0 |
| `logger.test.ts` | 12 | 12 | 0 |
| `mailer-logging.test.ts` | 5 | 5 | 0 |
| `mailer.test.ts` | 4 | 4 | 0 |
| `nfr004-access-control.test.ts` | 11 | 11 | 0 |
| `register-for-event-edge-cases.test.ts` | 11 | 11 | 0 |
| `registration-notifications.test.ts` | 13 | 13 | 0 |
| `registration-reminders-fallback.test.ts` | 2 | 2 | 0 |
| `registration-reporting.test.ts` | 10 | 10 | 0 |
| `registration.test.ts` | 55 | 55 | 0 |
| `session.test.ts` | 13 | 13 | 0 |
| `validation.test.ts` | 12 | 12 | 0 |
| **Total** | **320** | **320** | **0** |

## Scope

The automated suite covers account, session and access-control rules, event creation, editing, search and categories, registration, capacity, waitlist and reminders, notifications and email templates, CSV/PDF export and statistics, the central logger, and the coverage gate. Several modules call the API route handlers together with the business logic, so the suite is broader than isolated function-level unit tests.

## Execution environment and data safety

Tests run with `NODE_ENV=test`, so the mailer uses an in-memory JSON transport and no real email is sent. Concurrency cases run against a real PostgreSQL SERIALIZABLE transaction, because an in-memory mock cannot reproduce the "exactly one request wins" guarantee. The test scripts blank `LOG_FILE` so a run never writes to a developer's real log file.

## Coverage

Line coverage is 93.20%, branch coverage 82.55% and function coverage 85.78% (test and script files excluded). Core business-logic modules combined reach 93.40% against the 80% target, enforced in CI by `scripts/check-core-coverage.ts`. See [Code Coverage](Code_Coverage.txt) and [Branch Coverage](Branch_Coverage.txt); the raw table is in [reports/coverage-report.txt](reports/coverage-report.txt).

## Command

```sh
npm test
npm run test:coverage && npm run coverage:check
```
