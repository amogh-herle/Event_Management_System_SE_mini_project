# Fail → fix demonstration (deliberate fault injection)

**What this is:** three defects were *deliberately injected* into a scratch copy of `main`
(never into the repository) to show that the test suite detects regressions, then removed
again. These are **not** defects that existed in the project. Date: 2026-11-13.
Database: throwaway Postgres DB; full suite = `npx tsx --test` (270 tests).

| # | Injected fault (scratch copy only) | File | Requirement it breaks |
|---|---|---|---|
| F1 | Session-expiry check removed: `... \|\| expiresAt < Date.now()` deleted, so expired cookies stay valid | `lib/session.ts:45` | NFR-004 (session expiry), SRSec 2.2 |
| F2 | Capacity check weakened: `confirmedCount >= eventCapacity` → `>` (allows one extra seat = overbooking) | `lib/registration.ts:1151` | FR-008, NFR-002 |
| F3 | Capacity validation weakened: `num <= 0` → `num < 0` (accepts capacity 0) | `lib/validation.ts:105` | FR-004a/b |

## Runs

| Run | State of code | Result | Log |
|---|---|---|---|
| 1 | unmodified `main` | **270 pass, 0 fail** | `run1-baseline.txt` |
| 2 | F1 + F2 + F3 injected | **250 pass, 20 fail** (FAILED RUN) | `run2-with-injected-faults.txt` |
| 3 | the three lines restored from `HEAD` (correction) | **270 pass, 0 fail** (CORRECTION RUN) | `run3-after-correction.txt` |

## Tests that failed in run 2 (detected the faults)

* F1 → `verifySessionValue rejects an expired session` (`tests/session.test.ts`)
* F2 → `FR-008 / UT_01` (zero seats rejected), `FR-008 / IT_01` and `IT_02` (concurrency, never negative),
  `FR-008 / ST_01` (100 concurrent for 1 seat), `FR-008` overbooking-prevention, plus API tests
  `POST /api/events/[id]/register returns 400 when event is full`, the waitlist-join and auto-promotion tests
  (cascade: a seat that should be full is not)
* F3 → `createEventSchema capacity rules: rejects a zero or negative capacity`,
  `FR-004b: PUT /api/events/[id] rejects a non-positive capacity with 400`

The corrections were the three one-line reversions listed above; run 3 shows the suite fully green again.
