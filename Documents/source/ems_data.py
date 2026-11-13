# Single source of truth for the SRS / SAD / Test Plan / traceability documents.
# Run `python3 build.py` in this folder to regenerate the PDFs in ../.
# Results below were produced on 2026-11-13 (see docs/reports/).

TEAM = ["Shravani Mallur (PES1UG24CS621)", "Arjun Bhat (PES1UG24CS655)", "Amogh Herle (PES1UG24CS653)"]
DATE = "13 November 2026"

# id, title, "shall" statement, priority, stakeholder, acceptance criteria, issue, owner, sprint, points, SAD component, module
FRS = [
 ("FR-001a", "Account creation", "The system shall allow a user to create an account using name, email, password and a role (Participant or Organizer); the account shall be created inactive.", "High", "All users / Admin", "Account is stored inactive and cannot log in until verified. Malformed email or duplicate email is rejected. Fail: an account becomes active without verification.", 1, "Amogh", "Sprint 1", 3, "Authentication", "app/api/auth/signup"),
 ("FR-001b", "Email verification", "The system shall email a single-use, time-limited verification link and shall activate the account only when the link is used.", "High", "All users", "After the link is used login succeeds. Used, expired or invalid links are rejected. Fail: account active without verification, or link reusable.", 2, "Amogh", "Sprint 1", 2, "Authentication", "app/api/auth/verify, lib/tokens.ts"),
 ("FR-002a", "Login", "The system shall allow a verified, non-suspended user to log in with email and password and shall create a session.", "High", "All users", "Valid credentials log in; wrong credentials give one generic error (no account enumeration); unverified or suspended accounts are refused.", 3, "Amogh", "Sprint 1", 2, "Authentication", "app/api/auth/login, lib/session.ts"),
 ("FR-002b", "Password reset", "The system shall let a user reset a forgotten password through an emailed single-use link that expires within 1 hour.", "High", "All users", "Reset link changes the password and the old password stops working; reused, expired or invalid links are rejected; unknown email gets the same response as a known one.", 4, "Amogh", "Sprint 2", 3, "Authentication", "app/api/auth/forgot-password, reset-password"),
 ("FR-003a", "Role-based access control", "The system shall assign each user one role (Admin, Organizer, Participant) and shall restrict features by role on the server.", "High", "Admin", "Each role performs only permitted actions; a Participant calling an Organizer endpoint receives 403. Fail: a role performs an unauthorized action.", 5, "Amogh", "Sprint 1", 5, "Authentication", "lib/auth.ts"),
 ("FR-003b", "Profile update", "The system shall let a logged-in user update their own profile name; role and email shall not be editable through this function.", "Medium", "All users", "Name change is saved and shown on next read; unauthenticated request gets 401; a user cannot change their own role.", 6, "Amogh", "Sprint 2", 2, "Authentication", "app/api/auth/me"),
 ("FR-003c", "Admin manages user accounts", "The system shall let an Admin view all accounts and suspend, unsuspend or delete a user; a suspended or deleted account shall lose access immediately.", "High", "Admin", "Suspended account cannot log in and its live session is invalid on the next request; deleted account cannot log in; an Admin cannot suspend themself; non-admins get 403.", 7, "Amogh", "Sprint 2", 3, "UserAccounts", "app/api/admin/users"),
 ("FR-004a", "Create event", "An Organizer shall be able to create an event with name, description, date, time, venue, category and capacity (a positive integer).", "High", "Organizer", "All fields stored correctly; a missing field or capacity <= 0 is rejected; a Participant cannot create events.", 8, "Shravani", "Sprint 1", 3, "EventManager", "app/api/events"),
 ("FR-004b", "Edit event", "An Organizer shall be able to modify the details of an event they own after creation; capacity shall not drop below confirmed registrations.", "High", "Organizer", "Edits are saved and shown immediately; non-owner gets 403; stale edit gets 409; capacity below confirmed seats gets 409.", 9, "Shravani", "Sprint 2", 2, "EventManager", "app/api/events/[id] (PUT)"),
 ("FR-005a", "Cancel or delete event", "An Organizer shall be able to cancel or delete an event they own; a cancelled event shall not accept registrations.", "High", "Organizer", "Cancelled event rejects registrations; second cancel gets 409; participants and non-owners cannot cancel (403).", 10, "Shravani", "Sprint 1", 2, "EventManager", "app/api/events/[id] (PATCH, DELETE)"),
 ("FR-005b", "Notify participants of change", "When an event with registered participants is updated or cancelled, the system shall notify all affected participants by email, exactly once each, without failing the primary action if mail fails.", "High", "Participant", "Every affected participant is notified once, within 5 minutes; mail failure does not fail the cancel/update.", 11, "Shravani", "Sprint 2", 3, "NotificationService", "lib/registration.ts, lib/emailTemplates.ts"),
 ("FR-006a", "View events", "Users shall be able to view the list of upcoming, non-cancelled events.", "High", "Participant", "List shows all upcoming non-cancelled events and omits cancelled ones.", 12, "Shravani", "Sprint 1", 2, "EventCatalog", "app/events, app/api/events (GET)"),
 ("FR-006b", "Search and filter events", "Users shall be able to search events by name and filter by category, date or venue.", "High", "Participant", "Results contain only matching events; filters combine; special characters are treated as plain text.", 13, "Shravani", "Sprint 2", 3, "EventCatalog", "lib/eventFilters.ts"),
 ("FR-006c", "Admin manages categories", "An Admin shall be able to add, rename and remove event categories; changes shall be reflected platform-wide.", "Medium", "Admin", "Added category is selectable; rename updates every event; a category in use cannot be removed; non-admins get 403.", 14, "Shravani", "Sprint 2", 2, "Categories", "lib/categories.ts, app/api/admin/categories"),
 ("FR-007", "Register for event", "A logged-in user shall be able to register for an event; the system shall store user, event, timestamp and status and shall prevent duplicate registrations.", "High", "Participant", "A valid registration creates exactly one record; a second attempt is rejected (409).", 15, "Arjun", "Sprint 1", 3, "Registration", "app/api/events/[id]/register"),
 ("FR-008", "Capacity check", "The system shall verify remaining capacity before confirming a registration and shall reject registrations when the event is full, including under concurrency.", "High", "Participant", "A full event rejects registration; of 100 simultaneous requests for a 1-seat event exactly one is confirmed.", 16, "Arjun", "Sprint 1", 8, "CapacityCheck", "lib/registration.ts"),
 ("FR-009a", "Waitlist with auto-promotion", "When an event is full, users shall be able to join a waitlist; when a seat frees, the first waitlisted user shall be promoted and notified automatically.", "Medium", "Participant", "Waitlist is FIFO; the first waitlisted user is promoted and notified when a seat becomes available.", 17, "Arjun", "Sprint 2", 5, "Waitlist", "lib/registration.ts"),
 ("FR-009b", "Self-cancellation and notifications", "Users shall be able to cancel their own registration; the system shall send registration, cancellation and event-reminder notifications.", "Medium", "Participant", "Cancellation updates status and seat count immediately; confirmation, cancellation and reminder emails are sent; reminders are not re-sent.", 18, "Arjun", "Sprint 2", 3, "Registration, NotificationService", "lib/registration.ts, app/api/reminders"),
 ("FR-010a", "Counts, seat availability and export", "The system shall display registered counts and available seats per event and let an Organizer export the participant list as CSV or PDF.", "Medium", "Organizer", "Displayed and exported counts match active registrations; only the owning organizer (or admin) can export.", 19, "Arjun", "Sprint 2", 3, "Reports", "lib/export.ts"),
 ("FR-010b", "Admin platform statistics", "An Admin shall be able to view platform-wide totals of events, users and registrations.", "Medium", "Admin", "Displayed totals equal the live database totals; non-admins are rejected.", 20, "Arjun", "Sprint 2", 2, "Reports", "lib/stats.ts, app/api/admin/stats"),
]

# id, category, title, requirement, priority, acceptance, issue, owner, sprint, points, test group
NFRS = [
 ("NFR-001", "Performance", "Event list and search/filter pages shall load within 2 s and a registration shall complete within 3 s at the 95th percentile with 500 concurrent users; a 5,000-record CSV/PDF export shall complete within 10 s.", "High", "p95 <= 2 s (list/search), <= 3 s (registration), export <= 10 s. Test: NFT_01, NFT_02", None, "-", "-", "-"),
 ("NFR-002", "Scalability and concurrency", "The system shall support 10,000 users, 1,000 active events and 100,000 registrations without degradation and shall execute concurrent operations atomically (no overbooking, duplicate or lost update).", "High", "100 simultaneous requests for a 1-seat event confirm exactly one; 100 duplicate requests create one record; waitlist order is FIFO. Test: NFT_03, NFT_04", None, "-", "-", "-"),
 ("NFR-003", "Security - data protection", "Passwords shall be stored only as salted hashes (bcrypt/scrypt/Argon2); verification/reset links shall be single-use, random and time-limited; all traffic shall use TLS 1.2+; sensitive data at rest shall be encrypted.", "High", "No plain-text password in DB/logs; used/expired link rejected; TLS >= 1.2. Test: NFT_05, SEC_01, SEC_06, SEC_12", None, "-", "-", "-"),
 ("NFR-004", "Security - access control", "RBAC shall be enforced server-side on every request; sessions shall expire after 30 minutes of inactivity; accounts shall lock after 5 consecutive failed logins; OWASP Top 10 protections shall apply; administrative actions shall be audit-logged for 12 months.", "High", "Unauthorized API call returns 403; idle session rejected after 30 min; lock after 5 failures; each admin action logged. Test: NFT_06, SEC_03, SEC_04, SEC_10, SEC_11, SEC_13", 59, "Amogh", "Sprint 3", 3),
 ("NFR-005", "Availability and recovery", "The system shall be available 99.5% of each month (excluding <= 4 h announced maintenance); data shall be backed up daily and restorable with RPO <= 24 h and RTO <= 4 h.", "High", "Monthly uptime >= 99.5%; restore drill <= 4 h and <= 24 h data loss. Test: NFT_07", None, "-", "-", "-"),
 ("NFR-006", "Usability and accessibility", "A first-time participant shall find an event and register within 3 minutes without training; the interface shall meet WCAG 2.1 AA, be responsive from 320 px upward and work on the latest two versions of Chrome, Firefox, Safari and Edge.", "Medium", ">= 90% of first-time users succeed within 3 min; no WCAG AA failures; no horizontal scroll at 320 px. Test: NFT_08, NFT_11", 61, "Shravani", "Sprint 3", 3),
 ("NFR-007", "Maintainability", "Application errors shall be logged centrally with timestamp and severity, and the codebase shall have at least 80% automated test coverage of core business logic.", "Medium", "Forced error appears in central log with timestamp and severity; coverage >= 80% for core modules. Test: NFT_09, NFT_10", 62, "Shravani", "Sprint 3", 2),
]

# Security objectives (SRS 5.1.1)
SEC_OBJ = [
 ("SO-1", "Confidentiality", "Protect credentials and personal data (name, email) from disclosure, in storage and in transit."),
 ("SO-2", "Integrity and least privilege", "Ensure only authorized, authenticated actors can read or change events, registrations and accounts, and that data cannot be corrupted by malformed input or concurrent requests."),
 ("SO-3", "Availability and accountability", "Resist brute-force and abuse, keep a durable record of security-relevant actions, and keep data recoverable after failure."),
]

# id, requirement, SRSec section, objective, NFR, test ids, implementation status in main, where
SECREQS = [
 ("SR-001", "Passwords shall be stored only as salted bcrypt/Argon2 hashes and never logged.", "2.1", "SO-1", "NFR-003", "SEC_01", "Met", "bcryptjs cost 12 in signup / reset-password"),
 ("SR-002", "Session cookies shall be HttpOnly, SameSite and Secure (production), HMAC-signed, and shall expire after 30 minutes of inactivity.", "2.2", "SO-1, SO-2", "NFR-004", "SEC_02, SEC_11", "Partial", "Cookie flags and HMAC met; expiry is a 7-day absolute TTL, not 30 min idle"),
 ("SR-003", "The account shall lock after 5 consecutive failed login attempts.", "2.3", "SO-3", "NFR-004", "SEC_03", "Not met in main", "Implemented only in uncommitted local work (app/api/auth/login/route.ts); not merged, no tests"),
 ("SR-004", "RBAC and least privilege shall be enforced on the server for every request; no client-supplied role claim shall be trusted.", "3.1, 3.2", "SO-2", "NFR-004", "SEC_04, SEC_13", "Partial", "requireAdmin uses real sessions only; the Organizer/Participant demo fallback still trusts x-user-role / event_session_role"),
 ("SR-005", "Object references shall be authorized server-side (ownership checks) to prevent IDOR.", "3.3", "SO-2", "NFR-004", "SEC_05", "Met", "event.organizerId checks in app/api/events/[id], export, registrations"),
 ("SR-006", "All client-server traffic shall use TLS 1.2 or higher.", "4.1", "SO-1", "NFR-003", "SEC_06", "Met (hosting)", "Enforced by the hosting platform (Vercel); not independently scanned"),
 ("SR-007", "Sensitive data at rest shall be encrypted.", "4.2", "SO-1", "NFR-003", "SEC_06", "Met (hosting)", "Managed PostgreSQL encryption at rest; no application-level field encryption"),
 ("SR-008", "All database access shall use parameterized queries / an ORM.", "5.1", "SO-2", "NFR-004", "SEC_07", "Met", "Prisma only; no raw SQL"),
 ("SR-009", "User-supplied input shall be validated and output encoded to prevent XSS.", "5.2", "SO-2", "NFR-004", "SEC_08, SEC_15", "Met", "zod validation, escapeHtml in emails, React escaping, CSV formula neutralization"),
 ("SR-010", "State-changing requests shall be protected against CSRF.", "5.3", "SO-2", "NFR-004", "SEC_09", "Partial", "SameSite=Lax cookie only; no anti-CSRF token"),
 ("SR-011", "Security events and administrative actions shall be recorded in a durable audit log (12 months) without secrets or plain-text passwords.", "6.1, 6.2", "SO-3", "NFR-004, NFR-007", "SEC_10", "Not met in main", "AuditLog model and logEvent exist only in uncommitted local work; main logs console.error only"),
 ("SR-012", "Verification and reset tokens shall be random, single-use, time-limited and stored hashed; login errors shall not reveal whether an account exists.", "2.1", "SO-1", "NFR-003", "SEC_12, SEC_14", "Met", "lib/tokens.ts (sha256 hash, usedAt, expiresAt)"),
]

# Parent FR -> (title, [ (case id, title, expected, verified by, run) ]) ; sub-FR links per case
# run: "A" = automated/live re-run on 13 Nov 2026 (pass), "M" = manual UI walkthrough (4 Nov, not re-run)
TESTS = {
 "FR-001": [
  ("UT_01", "Signup with valid details", "201; account created unverified; login blocked until verified.", ["FR-001a"], "A", "scripts/test_fr001_fr003bc.ts TC-1, TC-5"),
  ("UT_02", "Signup rejected for malformed email", "400; no account created.", ["FR-001a"], "A", "test_fr001_fr003bc TC-2"),
  ("IT_01", "Verification link activates the account", "200; login succeeds afterwards.", ["FR-001b"], "A", "test_fr001_fr003bc TC-6, TC-7"),
  ("IT_02", "Expired / used / invalid link rejected", "400 expired / invalid; account stays inactive.", ["FR-001b"], "A", "test_fr001_fr003bc TC-8, TC-9, TC-10"),
  ("ST_01", "End-to-end signup, verify, first login", "User ends logged in.", ["FR-001a", "FR-001b"], "A", "test_fr001_fr003bc TC-1..TC-7"),
  ("ST_02", "Duplicate email rejected", "409; no duplicate account.", ["FR-001a"], "A", "test_fr001_fr003bc TC-3"),
 ],
 "FR-002": [
  ("UT_01", "Login with correct credentials", "200 and session cookie set.", ["FR-002a"], "A", "scripts/test_fr002a.ts TC-1"),
  ("UT_02", "Login with wrong password", "401 generic error; no session.", ["FR-002a"], "A", "test_fr002a TC-2, TC-3"),
  ("IT_01", "Forgot password sends reset link", "200; identical response for unknown email.", ["FR-002b"], "A", "scripts/test_fr002b.ts TC-1, TC-2"),
  ("IT_02", "Reset link updates password, old one invalid", "200; old password 401, new 200.", ["FR-002b"], "A", "test_fr002b TC-3, TC-4"),
  ("ST_01", "Forgot-password to login journey", "Login with new password succeeds.", ["FR-002b", "FR-002a"], "A", "test_fr002b TC-1..TC-4"),
  ("ST_02", "Expired / reused reset link rejected", "400 expired / invalid; password unchanged.", ["FR-002b"], "A", "test_fr002b TC-5, TC-7"),
 ],
 "FR-003": [
  ("UT_01", "Participant blocked from Organizer function", "403; no data returned.", ["FR-003a"], "A", "scripts/test_fr003a.ts TC-1"),
  ("UT_02", "User updates own profile name", "200; new name on next read.", ["FR-003b"], "A", "test_fr001_fr003bc TC-11..TC-14"),
  ("IT_01", "Admin suspends a user", "200; login 403 and live session invalid.", ["FR-003c"], "A", "test_fr001_fr003bc TC-17, TC-18; fr003a TC-3"),
  ("IT_02", "Admin deletes a user", "204; login then fails.", ["FR-003c"], "A", "test_fr001_fr003bc TC-20, TC-21"),
  ("ST_01", "Each role sees only its permitted menu items", "Only Admin sees Manage Users.", ["FR-003a"], "M", "Manual UI walkthrough (4 Nov); API-level role gating re-run in fr003a TC-1/TC-2"),
  ("ST_02", "Suspended user gets clear error at login", "403 'account suspended'; no session.", ["FR-003c", "FR-002a"], "A", "scripts/test_fr002a.ts TC-5"),
 ],
 "FR-004": [
  ("UT_01", "Event created with valid fields", "201; event stored with all fields.", ["FR-004a"], "A", "scripts/test_fr004a.ts UT_01"),
  ("UT_02", "Creation fails when a required field is missing", "400 'Required field missing'.", ["FR-004a"], "A", "test_fr004a UT_02; tests/validation.test.ts"),
  ("IT_01", "Edited details saved and listed immediately", "PUT 200; GET shows new details.", ["FR-004b"], "A", "tests/event-edit.test.ts (updated details returned by GET)"),
  ("IT_02", "Capacity accepts only a positive integer", "400 'capacity must be a positive integer'.", ["FR-004a", "FR-004b"], "A", "test_fr004a IT_02; tests/validation.test.ts; event-edit non-positive capacity"),
  ("ST_01", "Organizer creates then edits; participant sees update", "No stale data.", ["FR-004a", "FR-004b"], "A", "tests/event-edit.test.ts (saves all edited fields, no duplicate)"),
  ("ST_02", "Participant cannot create an event", "403.", ["FR-004a", "FR-003a"], "A", "test_fr004a ST_02"),
 ],
 "FR-005": [
  ("UT_01", "Cancelling marks the event cancelled", "Status CANCELLED.", ["FR-005a"], "A", "scripts/test_fr005a.ts TC-2"),
  ("UT_02", "Cancelled event rejects registrations", "400 event cancelled.", ["FR-005a"], "A", "tests/api-routes.test.ts (register returns 400 when event is cancelled)"),
  ("IT_01", "Cancelling notifies every registrant", "One notification per participant.", ["FR-005b"], "A", "tests/event-notifications.test.ts (notifies confirmed and waitlisted)"),
  ("IT_02", "Notification content names the event and changes", "Email shows event and change.", ["FR-005b"], "A", "event-notifications (changes and escape HTML; renamed event)"),
  ("ST_01", "Registered participant receives the cancellation email", "Email captured.", ["FR-005b"], "A", "event-notifications; mailer jsonTransport capture"),
  ("ST_02", "Cancelling an event with no registrants", "Success; zero notifications.", ["FR-005a", "FR-005b"], "A", "event-notifications (zero participants); fr005a TC-2"),
 ],
 "FR-006": [
  ("UT_01", "Search by exact event name", "Only the matching event returned.", ["FR-006b"], "A", "tests/event-search.test.ts (full name)"),
  ("UT_02", "Filter by category", "Only that category.", ["FR-006b"], "A", "event-search (category filter)"),
  ("IT_01", "Admin-added category appears in the creation form", "Category selectable.", ["FR-006c"], "A", "tests/admin-categories.test.ts (add; event creation links category)"),
  ("IT_02", "Filter by date", "Only events on that date.", ["FR-006b"], "A", "event-search (date filter)"),
  ("ST_01", "Search + category + date together", "Intersection only.", ["FR-006b"], "A", "event-search (combine filters)"),
  ("ST_02", "Cancelled events excluded from listing and search", "Not shown.", ["FR-006a", "FR-006b"], "A", "event-search (keep excluding cancelled); fr005a TC-3"),
 ],
 "FR-007": [
  ("UT_01", "Valid registration creates a correct record", "201; user/event/status stored.", ["FR-007"], "A", "tests/registration.test.ts FR-007 / UT_01"),
  ("UT_02", "Duplicate registration rejected", "409 already registered.", ["FR-007"], "A", "registration.test FR-007 / UT_02; live 100-duplicate run (1 row)"),
  ("IT_01", "Registration decrements the seat count by one", "Remaining seats N-1.", ["FR-007", "FR-008"], "A", "registration.test FR-008 / UT_02"),
  ("IT_02", "New registration appears in organizer's registrant list", "Listed.", ["FR-007", "FR-010a"], "A", "tests/api-routes.test.ts (registrations list; organizer totals)"),
  ("ST_01", "Register, see confirmation, organizer sees entry", "End to end.", ["FR-007"], "A", "api-routes (creates registration and GET lists it)"),
  ("ST_02", "Cancelled or non-existent event rejected", "400 / 404.", ["FR-007", "FR-005a"], "A", "registration.test FR-007 / ST_02"),
 ],
 "FR-008": [
  ("UT_01", "Registration rejected when zero seats remain", "400 event full.", ["FR-008"], "A", "registration.test FR-008 / UT_01"),
  ("UT_02", "Registration succeeds when a seat is available", "Seat count to 0.", ["FR-008"], "A", "registration.test FR-008 / UT_02"),
  ("IT_01", "Only one of two simultaneous requests for last seat wins", "Exactly one confirmed.", ["FR-008"], "A", "registration.test FR-008 / IT_01"),
  ("IT_02", "Capacity never negative under 10 concurrent requests", "Final count 0.", ["FR-008"], "A", "registration.test FR-008 / IT_02"),
  ("ST_01", "100 concurrent requests for a 1-seat event", "Exactly 1 confirmed, 99 rejected.", ["FR-008"], "A", "registration.test FR-008 / ST_01; live production-build run: 1 x 201, 99 x 400, 1 DB row"),
  ("ST_02", "Participant sees 'Event Full' and cannot register", "Full message / disabled button.", ["FR-008", "FR-009a"], "M", "Manual UI walkthrough (4 Nov); API 'event full' re-run in api-routes tests"),
 ],
 "FR-009": [
  ("UT_01", "Joining waitlist records queue position", "Position returned.", ["FR-009a"], "A", "registration.test FR-009a / UT_01"),
  ("UT_02", "Self-cancel frees the seat", "Status cancelled; seats +1.", ["FR-009b"], "A", "registration.test FR-009b / UT_02"),
  ("IT_01", "Cancellation promotes the first waitlisted user", "Promoted and notified.", ["FR-009a"], "A", "registration.test FR-009a / IT_01"),
  ("IT_02", "Confirmation email sent after registration", "Email captured.", ["FR-009b"], "A", "registration.test FR-009b / IT_02"),
  ("ST_01", "Waitlisted user auto-promoted and notified", "Status confirmed + email.", ["FR-009a"], "A", "registration.test FR-009a / ST_01"),
  ("ST_02", "Reminder sent before event, not re-sent", "One reminder per registrant.", ["FR-009b"], "A", "registration.test FR-009b / ST_02; reminders fallback tests"),
 ],
 "FR-010": [
  ("UT_01", "Displayed registered count equals active registrations", "Exact match.", ["FR-010a"], "A", "registration.test FR-010a / UT_01"),
  ("UT_02", "Available seats = capacity minus active registrations", "Exact match.", ["FR-010a"], "A", "registration.test FR-010a / UT_02"),
  ("IT_01", "CSV export matches the on-screen list", "Same rows.", ["FR-010a"], "A", "registration.test FR-010a / IT_01; api-routes export csv"),
  ("IT_02", "PDF export matches the on-screen list", "Same rows.", ["FR-010a"], "A", "registration.test FR-010a / IT_02; api-routes export pdf"),
  ("ST_01", "Admin statistics equal database totals", "50 events / 300 users / 900 registrations.", ["FR-010b"], "A", "tests/admin-stats.test.ts FR-010b / ST_01"),
  ("ST_02", "Organizer sees accurate per-event info for several events", "No cross-event mixing.", ["FR-010a"], "A", "registration.test FR-010a / ST_02"),
 ],
}

# id, nfr, description, result, evidence
NFT = [
 ("NFT_01", "NFR-001", "CSV and PDF export of 5,000 registrations completes within 10 s.", "Pass", "Live run on main production build: CSV 216 ms, PDF 226 ms; also tests/registration.test.ts."),
 ("NFT_02", "NFR-001", "At 500 concurrent users: event list/search/filter p95 <= 2 s and registration p95 <= 3 s (dataset: 10,000 users, 1,000 events, 100,000 registrations).", "Fail", "Local single-machine run: list/search p95 8.3 s (p50 5.3 s); 500 simultaneous registrations p95 121.7 s, 0 errors. Targets NOT met; app, DB and load generator shared one laptop, so absolute numbers are pessimistic, but registrations appear to be serialized."),
 ("NFT_03", "NFR-002", "100 simultaneous requests for a 1-seat event confirm exactly one; 100 duplicate requests from one user create one record.", "Pass", "Live run at full scale: 1 x 201 + 99 x 400, 1 confirmed row; duplicates: 1 x 201 + 99 x 409, 1 row. Also registration.test.ts."),
 ("NFT_04", "NFR-002", "Waitlist entries are promoted in strict FIFO order under concurrent cancellations.", "Pass", "tests/registration.test.ts FR-009a / NFR-002."),
 ("NFT_05", "NFR-003", "Passwords hashed; tokens single-use, expiring and hashed; no plain-text secrets.", "Pass", "See SEC_01, SEC_12 (live TC-4, TC-8..TC-10; fr002b TC-5..TC-7)."),
 ("NFT_06", "NFR-004", "RBAC, session timeout, account lockout, audit log.", "Partial", "RBAC pass (SEC_04/05), lockout and audit log not in main (SEC_03, SEC_10), 30-min idle timeout not implemented (SEC_11), demo-role header accepted (SEC_13)."),
 ("NFT_07", "NFR-005", "Restore drill from backup completes within 4 h with <= 24 h data loss; uptime >= 99.5%.", "Partial", "Local drill (10,000 users / 1,000 events / 100,405 registrations): pg_dump 0.38 s, pg_restore into a fresh DB 1.0 s, row counts identical. Daily scheduled backup and monthly uptime monitoring are not configured, so RPO and 99.5% uptime are not demonstrated."),
 ("NFT_08", "NFR-006", "WCAG 2.1 A/AA automated scan (axe-core 4.10.2) and a first-time-user study (>= 90% in 3 min).", "Partial", "axe-core: 0 violations on 9 pages at 1280 px and at 320 px (home, login, signup, forgot-password, events, event detail, create event, my registrations, admin). The usability study was not run (needs human participants)."),
 ("NFT_09", "NFR-007", "Automated line coverage of core business logic >= 80%.", "Pass", "270 tests; 92.29% overall lines; lib/registration.ts 92.77%, lib/auth.ts 92.27%, lib/mailer.ts 100%, lib/emailTemplates.ts 100% (docs/reports/coverage-report.txt)."),
 ("NFT_10", "NFR-007", "A forced application error appears in a central log with timestamp and severity.", "Fail", "Main only calls console.error. A durable AuditLog exists only in uncommitted local work (PR #64 for NFR-007 is open, conflicting)."),
 ("NFT_11", "NFR-006", "No horizontal scroll at 320 px on key pages.", "Fail", "7 of 9 pages overflow horizontally at 320 px on main; fixed by open PR #63 (feature/nfr-006-accessibility, not yet reviewed or merged)."),
]

# id, srsec, requirement/description, result, evidence, sr ids
SEC = [
 ("SEC_01", "2.1", "Passwords are stored as bcrypt hashes, never plain text or in logs.", "Pass", "Live TC-4 (hash starts $2, differs from password); code review of signup/reset-password.", ["SR-001"]),
 ("SEC_02", "2.2", "Session cookie is HttpOnly, SameSite=Lax, Secure in production; HMAC verified in constant time; tampered or expired cookies rejected.", "Pass", "tests/session.test.ts (13 tests).", ["SR-002"]),
 ("SEC_03", "2.3", "Account locks after 5 consecutive failed logins.", "Fail", "Not in main. Uncommitted local work exists (login route + schema) but has no tests and breaks `tsc` (Next route file exports a constant).", ["SR-003"]),
 ("SEC_04", "3.1/3.2", "A role without permission calling an endpoint directly gets 403 and no data.", "Pass", "api-routes (export 403), admin-categories (non-admins), admin-stats (RBAC), live TC-16/TC-21, fr003a TC-1.", ["SR-004"]),
 ("SEC_05", "3.3", "Organizer A cannot edit, cancel or export Organizer B's event (IDOR).", "Pass", "event-edit (403 non-owner), event-notifications (unauthorized cancel), api-routes (export / registrations 403 other organizer).", ["SR-005"]),
 ("SEC_06", "4.1/4.2", "All traffic over TLS 1.2+; data encrypted at rest.", "Not run", "Provided by the hosting platform; no TLS scan or storage audit was possible locally. Secure cookie attribute in production is tested (SEC_02).", ["SR-006", "SR-007"]),
 ("SEC_07", "5.1", "SQL-injection payloads in search/filter/event fields have no effect.", "Pass", "event-search (special characters plain text; LIKE wildcards escaped); no raw SQL in lib/ or app/api/.", ["SR-008"]),
 ("SEC_08", "5.2", "Script payloads are escaped in notification email and page output.", "Pass", "event-notifications ('escape HTML'), email-templates tests.", ["SR-009"]),
 ("SEC_09", "5.3", "A cross-site request cannot perform a state-changing action with the victim's session.", "Partial", "SameSite=Lax only; no anti-CSRF token.", ["SR-010"]),
 ("SEC_10", "6.1/6.2", "Security events and admin actions are written to a durable audit log without secrets.", "Fail", "Not in main; only console.error. AuditLog implementation exists in uncommitted local work, untested.", ["SR-011"]),
 ("SEC_11", "2.2", "A session idle for 30 minutes is rejected.", "Fail", "lib/session.ts uses a fixed 7-day absolute TTL; no inactivity timeout (NFR-004 not met).", ["SR-002"]),
 ("SEC_12", "2.1", "Verification and reset tokens are single-use, expiring and stored hashed.", "Pass", "Live TC-8..TC-10; fr002b TC-5..TC-7; tokens stored as sha256 hash.", ["SR-012"]),
 ("SEC_13", "3.1", "An unauthenticated caller cannot act as Organizer or Participant by sending an x-user-role header or event_session_role cookie.", "Fail", "lib/auth.ts getAuthUserFromRequest falls back to the demo role claim when there is no session (fr003a TC-4 confirms an Organizer action succeeds). requireAdmin is not affected (real session only).", ["SR-004"]),
 ("SEC_14", "2.1", "Login and forgot-password do not reveal whether an email is registered.", "Pass", "fr002a TC-3 (same error), fr002b TC-2 (same message).", ["SR-012"]),
 ("SEC_15", "5.2", "CSV export neutralizes spreadsheet formula-injection payloads.", "Pass", "tests/registration.test.ts (formula-injection case).", ["SR-009"]),
 ("SEC_16", "3.1", "A suspended user's still-valid session stops working on the next request.", "Pass", "Live TC-17; fr003a TC-3.", ["SR-004"]),
]

# Final stats for the execution summary
STATS = dict(auto_total=270, auto_pass=270, live_total=74, live_pass=74, coverage="92.29%", func_cases=60, func_auto=58, func_manual=2)
