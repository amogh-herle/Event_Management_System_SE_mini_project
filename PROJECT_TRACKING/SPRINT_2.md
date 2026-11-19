# Sprint 2 — 26 to 31 October 2026

## Assigned deliverables

| GitHub issue | Deliverable | Owner | Points |
|---|---|---|---:|
| [#4 FR-002b](https://github.com/amogh-herle/Event_Management_System_SE_mini_project/issues/4) | Password reset | Amogh | 3 |
| [#6 FR-003b](https://github.com/amogh-herle/Event_Management_System_SE_mini_project/issues/6) | Profile update | Amogh | 2 |
| [#7 FR-003c](https://github.com/amogh-herle/Event_Management_System_SE_mini_project/issues/7) | Admin manages user accounts | Amogh | 3 |
| [#9 FR-004b](https://github.com/amogh-herle/Event_Management_System_SE_mini_project/issues/9) | Edit event | Shravani | 2 |
| [#11 FR-005b](https://github.com/amogh-herle/Event_Management_System_SE_mini_project/issues/11) | Notify participants of change | Shravani | 3 |
| [#13 FR-006b](https://github.com/amogh-herle/Event_Management_System_SE_mini_project/issues/13) | Search and filter events | Shravani | 3 |
| [#14 FR-006c](https://github.com/amogh-herle/Event_Management_System_SE_mini_project/issues/14) | Admin manages categories | Shravani | 2 |
| [#17 FR-009a](https://github.com/amogh-herle/Event_Management_System_SE_mini_project/issues/17) | Waitlist with auto-promotion | Arjun | 5 |
| [#18 FR-009b](https://github.com/amogh-herle/Event_Management_System_SE_mini_project/issues/18) | Self-cancellation and notifications | Arjun | 3 |
| [#19 FR-010a](https://github.com/amogh-herle/Event_Management_System_SE_mini_project/issues/19) | Counts, seat availability and export | Arjun | 3 |
| [#20 FR-010b](https://github.com/amogh-herle/Event_Management_System_SE_mini_project/issues/20) | Admin platform statistics | Arjun | 2 |

All eleven items are Done. Sprint 3 (from 4 November) covered the non-functional requirements: [#59 NFR-004](https://github.com/amogh-herle/Event_Management_System_SE_mini_project/issues/59), [#61 NFR-006](https://github.com/amogh-herle/Event_Management_System_SE_mini_project/issues/61) and [#62 NFR-007](https://github.com/amogh-herle/Event_Management_System_SE_mini_project/issues/62), all closed.

## Development freeze

Sprint 2 feature work was merged by 4 November and the documents were finalised afterwards. The Sprint 2 code and documentation reconcile as follows:

- Implemented behaviour was checked against the SRS, SAD and Test Plan; the results are in `Documents/TEST-PLAN_DOCUMENT.pdf` and `docs/System_Validation_Report.md`.
- Event editing, search and filtering, and admin categories were merged, reverted because they had been merged before review, and re-merged after review (pull requests #46 to #54).
- Deviations and their reasons are in `Documents/SAD_DOCUMENT.pdf` section 4.6.

## CI and review

The CI pipeline is described in [SPRINT_1.md](SPRINT_1.md). Pull requests #39, #40 and #45 to #54 carry a repository-owner review.

## Demo

The two-minute working-product video is [Documents/VIDEOS/SPRINT-2_DEMO.mp4](../Documents/VIDEOS/SPRINT-2_DEMO.mp4) (114.9 seconds).
