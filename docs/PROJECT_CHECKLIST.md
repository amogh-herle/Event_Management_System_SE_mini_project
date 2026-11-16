# Project checklist — status as of 13 Nov 2026

Legend: **[x]** done and verified · **[~]** done with a caveat · **[ ]** not done / needs the team or repo owner.
Verified against `origin/main` (up to date with local `main`) plus the local working tree.

## Part 1 — Requirements & design documents

### SRS (`Documents/SRS_DOCUMENT.pdf`, v3.0)
- [x] Standard IEEE-style format: follows the course template (intro, overall description, interfaces, features, NFRs, quality/acceptance, UML models, RTM)
- [x] Introductory and descriptive sections (§1 purpose/scope/audience/definitions, §2 perspective/functions/roles/environment/constraints)
- [x] FRs and NFRs clear and measurable: 20 FRs (FR-001a … FR-010b), 7 NFRs with numeric acceptance criteria
- [x] At least 1 UML use case diagram: 2 included (`USECASE_DIAGRAM.svg`, new `USECASE_DIAGRAM_2.svg`)
- [x] Security section ≥2 objectives and ≥2 requirements: 3 objectives (SO-1..3), 12 requirements (SR-001..012)

### Test Plan (`Documents/TEST-PLAN_DOCUMENT.pdf`, v3.0)
- [x] Standard IEEE-style format; sections 1–15 follow the course template numbering
- [x] Sections 3, 4 and 5 completely filled
- [x] Section 5.1 dedicated to security validation (16 cases)
- [x] Traceability back to the SRS (§13 forward + reverse; separate `TRACEABILITY_MATRICES.pdf`)
- [x] 7–10 minimum test cases covering FRs and NFRs: 60 functional + 11 non-functional + 16 security

### SAD (`Documents/SAD_DOCUMENT.pdf`, v3.0)
- [x] Standard IEEE-style format; follows the course SAD template (sections 1–5)
- [x] Architecture: component diagram + descriptions, pattern + rationale, traceability (3.8), security architecture incl. STRIDE (3.9)
- [x] Design: 2 UML sequence diagrams, API design with 3 interface definitions, error-handling protocols

## Part 2 — Agile planning & repository

- [x] GitHub Project "EVENT MANAGEMENT" exists and holds the repo's issues (https://github.com/users/amogh-herle/projects/2)
- [x] Backlog items from FRs and NFRs: 20 FR issues (#1–#20) and NFR issues #59, #61, #62
- [x] Story points (Estimate) set on all 23 items
- [x] Items assigned to individual members (Amogh #1–7, #59; Shravani #8–14, #61, #62; Arjun #15–20)
- [x] Sprint 1 (19 Oct), Sprint 2 (26 Oct) and Sprint 3 (4 Nov) set on the board
- [~] Issues #56, #57, #58, #60 (NFR-001/002/003/005) were **deleted on request** on 13 Nov, so those four NFRs no longer have backlog items (they remain in the SRS and are tested)

## Sprint 1 execution

- [x] GitHub Actions enabled (`.github/workflows/ci.yml`; latest run on main: success)
- [x] Code matches SRS/SAD, with deviations documented (SAD 4.6, D1–D9)
- [~] PRs raised by the assigned member: yes for the PRs checked; see the review point below
- [ ] **PRs reviewed and merged by the repository owner (`amogh-herle`)**: merged by someone else: #21, #28, #34, #36, #37, #38, #39 (and #46, #48, #49, #52–#54 self-merged by their author). Open and unreviewed: #63 (NFR-006, mergeable), #64 (NFR-007, conflicting). Owner action needed; I did not merge anything.
- [x] 1-minute demo video: `Documents/VIDEOS/SPRINT-1_DEMO.mp4` (59.9 s)

## Sprint 2 execution

- [ ] Development cycle "officially frozen": a team decision, not verifiable from the repo. Note: local uncommitted NFR-004 work exists (lockout, audit log) and PRs #63/#64 are open
- [x] Deviations from SRS/SAD formally documented (SAD 4.6, D1–D9)
- [x] Remaining documentation finalized (this update)
- [x] 2-minute demo video: `Documents/VIDEOS/SPRINT-2_DEMO.mp4` (114.9 s)

## Part 3 — Testing & QA

- [x] Original test cases updated (Test Plan v3.0; test IDs now `FRnnn-UT_01` etc.; new live script `scripts/test_fr001_fr003bc.ts` closes the FR-001/003b/003c automation gap)
- [~] All tests executed per plan: everything that can run locally was run on 13 Nov. **Not executed:** usability study (needs people), TLS/encryption audit (hosting), monthly uptime, Safari/Edge. See Test Plan §14.
- [x] Generated reports in `docs/reports/`: `test-run.txt`, `coverage-report.txt`, `live-api-test-run.txt`, `fault-injection/` (fail → fix demonstration)

Results: 270/270 automated pass, 74/74 live checks pass, coverage 92.29%. **Failures reported honestly:** NFT_02 (latency at 500 users), SEC_03, SEC_10, SEC_11, SEC_13, NFT_10, NFT_11; partials: SEC_09, NFT_06, NFT_07, NFT_08.

## Part 4 — Final evaluation (team to do at the demo)

- [ ] Application works for the core use cases (functional tests pass; see caveats above)
- [ ] Team explains the deviations: use SAD 4.6 (D1–D9)
- [~] Codebase accessible/readable and under version control: yes; local changes are uncommitted

## Findings that need a decision

1. **SEC_13 (security):** `requireOrganizer` and the registration routes accept an `x-user-role` header or `event_session_role` cookie with no session, in production. An unauthenticated caller can act as the shared demo Organizer/Participant. Admin routes are not affected. Suggested fix: honour the fallback only when `NODE_ENV !== "production"`.
2. **Uncommitted NFR-004 work breaks the build:** `app/api/auth/login/route.ts` exports `ACCOUNT_LOCKED_ERROR` etc.; Next.js rejects non-route exports (`tsc` error). Move the constants to `lib/`. It also has no tests.
3. **SEC_11:** sessions last 7 days absolute; the SRS requires a 30-minute inactivity timeout.
4. **NFT_02:** registration latency under 500 concurrent users is far above target in the local run.
5. `.github/workflows/ci.yml` comments still say coverage is ~78%; it is now 92%, so the coverage step could become a real gate.
