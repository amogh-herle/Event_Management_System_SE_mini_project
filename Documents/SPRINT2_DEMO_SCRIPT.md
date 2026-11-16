# Sprint 2 Demo Video Script — Event Management System

Target length: **2 minutes**. Covers only what's new since the Sprint 1 demo: FR-004b, FR-005b, FR-006b, FR-006c, FR-010b. Everything else (signup, login, create event, register, waitlist, cancel-and-notify-self, export) was already shown in Sprint 1 — skip it here.

Suggested presenters based on project-board ownership: **Shravani** (events module: FR-004b/005b/006b/006c), **Arjun** (reporting: FR-010b). Amogh can narrate the intro/outro or swap in. Adjust to who's actually free to record.

Before recording: seed the database with a couple of events, at least one with 2+ registrants, and at least one existing category, so the search/filter and notification steps have something to show.

---

### 0:00–0:10 — Intro (either presenter)
**Screen:** Events directory, logged out or on the landing page.
**Say:** "This is Sprint 2 of our Event Management System. Since the last demo we've added event editing with participant notifications, search and filtering, category management, and admin statistics."

### 0:10–0:35 — FR-006b: Search & filter (Shravani)
**Screen:** `/events` — events directory.
**Do:** Type a partial event name into the search box → results narrow live. Then open the category filter, pick one category, and the date filter, pick a range.
**Say:** "Participants can search events by name and filter by category, date, or venue — combined, not just one at a time. Cancelled events never show up here."

### 0:35–0:55 — FR-006c: Category management (Shravani or Amogh)
**Screen:** `/admin/categories`.
**Do:** Add a new category (e.g. "Hackathons"), show it appear in the list. Switch to the Create Event form and show the new category in the dropdown.
**Say:** "Admins manage the category list centrally. A new category shows up immediately on the event-creation form and in the filters we just saw."

### 0:55–1:25 — FR-004b + FR-005b: Edit an event, participants get notified (Shravani)
**Screen:** An organizer's event detail page → "Edit Event".
**Do:** Change the venue and time, save. Show the updated details on the public listing page. Then open a mail-capture view (Ethereal preview link or the server log) and show the "Event Updated" email that went out, naming what changed.
**Say:** "Organizers can edit event details after publishing. Anyone already registered — confirmed or waitlisted — automatically gets an email telling them exactly what changed, like venue or time. Their registration itself is untouched."

**Then (cancel path, ~10s):**
**Do:** Cancel a different event with at least one registrant. Show the confirmation modal text mentioning the notification, then the resulting "Event Cancelled" email.
**Say:** "Cancelling an event works the same way — participants are notified by email the moment it's cancelled, and it's safe even if two cancel requests come in at once."

### 1:25–1:50 — FR-010b: Admin platform statistics (Arjun)
**Screen:** `/admin/stats`.
**Do:** Show the totals (events, users, registrations) and, if there's a per-category or per-organizer breakdown, scroll to it.
**Say:** "Admins get a live, platform-wide view — total events, users, and registrations — pulled straight from the database, not a cached snapshot."

### 1:50–2:00 — Close (either presenter)
**Screen:** Back to the events directory.
**Say:** "That's Sprint 2 — editing, notifications, search, categories, and admin reporting, all built on top of the registration and waitlist core from Sprint 1."

---

## Notes for whoever edits the recording
- If timing runs long, cut the category-management beat (0:35–0:55) first — it's the least load-bearing for grading, since FR-006c's acceptance criteria are already covered by automated tests.
- Keep the "participants will be notified by email" line in the cancel-confirmation modal on screen for a beat — it's a visible, gradable proof point for FR-005b, not just the email itself.
- No need to narrate error cases (invalid capacity, duplicate registration, etc.) — those were covered in Sprint 1 and are exercised by the automated test suite (270 passing), not something the video needs to prove.
