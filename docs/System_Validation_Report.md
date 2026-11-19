# System Validation Report

- **Project:** Event Management System (EMS)
- **Execution date:** 19 November 2026
- **Result:** **PASS WITH DOCUMENTED EXCEPTIONS — all automated and live checks passed; three non-functional targets are not met (see Validation notes)**

## Validation summary

| Validation area | Checks | Result |
|---|---:|---|
| Security controls: lockout, idle timeout, CSRF, sessions, input validation | 36 | Pass |
| Events: creation, editing, search, filtering, admin categories | 62 | Pass |
| Registration, capacity, waitlist, reminders and reporting | 91 | Pass |
| Notifications, email templates and mail transport | 46 | Pass |
| API routes, participant export and admin statistics | 59 | Pass |
| Central logging, coverage gate and accessibility structure | 26 | Pass |
| **Automated tests (`node:test`)** | **320** | **320 passed, 0 failed** |
| Live API checks against a running production build (`scripts/test_fr*.ts`) | 74 | 74 passed, 0 failed |
| TypeScript type check (`tsc --noEmit`) | — | Pass |
| Production build (`next build`) | — | Pass |
| Accessibility scan (axe-core 4.10.2), 9 pages at 1280 px and 320 px | 9 pages | 0 violations |
| Concurrency: 100 simultaneous requests for a 1-seat event | 1 | Pass (1 confirmed, 99 rejected, 1 database row) |
| Export of 5,000 registrations (10 s target) | 1 | Pass (CSV 216 ms, PDF 226 ms) |
| Restore drill (`pg_dump` and `pg_restore` of 100,405 registrations) | 1 | Pass (about 1 s, row counts identical) |

## Requirement status

| Requirement group | Validated | Notes |
|---|---|---|
| Functional requirements FR-001a to FR-010b | 20 of 20 | 60 of 60 cases pass (58 automated or live, 2 manual UI walkthroughs) |
| Non-functional requirements NFR-001 to NFR-007 | 4 of 7 | NFR-001, NFR-005 and NFR-006 are partially validated (below) |
| Security requirements SR-001 to SR-012 | 10 of 12 | SR-006 and SR-007 (TLS, encryption at rest) were not run because the project runs locally |

## Validation notes

- **Not met: NFT_02 (NFR-001).** At 500 simultaneous users on one laptop, list and search p95 was 8.3 s (target 2 s) and registration p95 was 121.7 s (target 3 s), with zero errors. The application, database and load generator shared one machine, so the numbers are pessimistic, but registration appears to be serialized by the per-event lock.
- **Partial: NFT_07 (NFR-005).** The restore drill passed, but no daily backup schedule or uptime monitor is configured, so the 24-hour recovery point and 99.5% uptime are not demonstrated.
- **Partial: NFT_08 (NFR-006).** The automated accessibility scan is clean, but the first-time-user study (90% within 3 minutes) was not run, and Safari and Edge were not tested.
- **Not run: SEC_06.** TLS 1.2+ and encryption at rest depend on the deployment environment.
- Tests ran with a mocked mail transport, so no real email was sent.
- Detailed per-module counts are in the [Unit Test Report](Unit_Test_Report.md). Coverage figures are in [Code Coverage](Code_Coverage.txt) and [Branch Coverage](Branch_Coverage.txt). The full case list with results is in `Documents/TEST-PLAN_DOCUMENT.pdf` (Appendix A and B).

## Test execution

The full suite of 320 tests completes in about one second. The live API checks and the load, restore and accessibility runs are recorded in [reports/live-api-test-run.txt](reports/live-api-test-run.txt).
