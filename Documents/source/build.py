#!/usr/bin/env python3
"""Regenerate SRS_DOCUMENT.pdf, SAD_DOCUMENT.pdf, TEST-PLAN_DOCUMENT.pdf and
TRACEABILITY_MATRICES.pdf (+ USECASE_DIAGRAM_2.svg) from ems_data.py.
Usage: python3 build.py   (needs google-chrome)"""
import html, os, subprocess, sys
from ems_data import *

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
e = lambda s: html.escape(str(s), quote=False)

CSS = """
@page { size: A4; margin: 18mm 15mm 18mm 15mm; @bottom-center { content: counter(page) " / " counter(pages); font-size: 9pt; color:#555 } }
body{font-family:'DejaVu Sans',Arial,sans-serif;font-size:9.6pt;line-height:1.38;color:#111}
h1.t{font-size:22pt;text-align:center;margin:60px 0 4px} .sub{text-align:center;font-size:12pt;color:#333;margin:0 0 4px}
h1{font-size:15pt;border-bottom:2px solid #1f3a6e;padding-bottom:3px;margin-top:22px;color:#1f3a6e;break-after:avoid}
h2{font-size:12pt;margin-top:16px;color:#1f3a6e;break-after:avoid} h3{font-size:10.5pt;margin-top:12px;break-after:avoid}
table{border-collapse:collapse;width:100%;margin:6px 0 10px;font-size:8.4pt} th,td{border:1px solid #888;padding:3px 5px;vertical-align:top;text-align:left}
th{background:#e6ecf7} tr{break-inside:avoid} .meta td{border:none;padding:1px 4px;font-size:10pt}
.pass{color:#0a6b2d;font-weight:bold}.fail{color:#b00020;font-weight:bold}.part{color:#a65f00;font-weight:bold}.na{color:#555;font-weight:bold}
.note{background:#fff7e0;border-left:4px solid #d9a400;padding:5px 8px;margin:8px 0;font-size:9pt}
.fig{text-align:center;margin:8px 0;break-inside:avoid} .fig img{max-width:100%;max-height:200mm} .cap{font-size:8.6pt;color:#333;text-align:center}
.pb{break-before:page} ul{margin:3px 0 6px 18px;padding:0} code{font-size:8.4pt;background:#f1f1f1;padding:0 2px}
"""

def res(r):
    c = {"Pass": "pass", "Met": "pass", "Fail": "fail", "Not met in main": "fail", "Partial": "part"}.get(r, "na")
    if r.startswith("Met (") : c = "pass"
    return f'<span class="{c}">{e(r)}</span>'

def table(head, rows, raw_cols=()):
    h = "".join(f"<th>{e(x)}</th>" for x in head)
    b = ""
    for r in rows:
        b += "<tr>" + "".join(f"<td>{c if i in raw_cols else e(c)}</td>" for i, c in enumerate(r)) + "</tr>"
    return f"<table><tr>{h}</tr>{b}</table>"

def page(title, body):
    return f"<!doctype html><html><head><meta charset='utf-8'><title>{e(title)}</title><style>{CSS}</style></head><body>{body}</body></html>"

def header(title, sub, version, status, revnote):
    authors = " · ".join(TEAM)
    return f"""<h1 class="t">{e(title)}</h1><p class="sub">{e(sub)}</p>
<table class="meta"><tr><td><b>Project:</b></td><td>Event Management System (EMS) — SE Mini Project</td></tr>
<tr><td><b>Version:</b></td><td>{e(version)}</td></tr><tr><td><b>Authors:</b></td><td>{e(authors)}</td></tr>
<tr><td><b>Date:</b></td><td>{DATE}</td></tr><tr><td><b>Status:</b></td><td>{e(status)}</td></tr></table>
<h3>Revision history</h3>
{table(["Version","Date","Author","Change summary","Approval"],[["1.0","21 Oct 2026","Team","First issue (Sprint 1)",""],["2.0","04 Nov 2026","Team","Sprint 2 update",""],[version,"13 Nov 2026","Team",revnote,""]])}
<h3>Approvals</h3>
{table(["Role","Name","Signature / Email","Date"],[["Course Coordinator","","",""],["Repository Owner","Amogh Herle","",""],["Team members","Shravani Mallur, Arjun Bhat","",""]])}"""

# --------------------------------------------------------------------------- diagrams
def usecase2_svg():
    W, H = 1100, 760
    ell = lambda x, y, t, c="#dae8fc": f'<ellipse cx="{x}" cy="{y}" rx="118" ry="27" fill="{c}" stroke="#6c8ebf"/><text x="{x}" y="{y+4}" text-anchor="middle" font-size="12">{t}</text>'
    def actor(x, y, n):
        return (f'<circle cx="{x}" cy="{y-30}" r="10" fill="#fff" stroke="#000"/><line x1="{x}" y1="{y-20}" x2="{x}" y2="{y+15}" stroke="#000"/>'
                f'<line x1="{x-18}" y1="{y-8}" x2="{x+18}" y2="{y-8}" stroke="#000"/><line x1="{x}" y1="{y+15}" x2="{x-14}" y2="{y+38}" stroke="#000"/>'
                f'<line x1="{x}" y1="{y+15}" x2="{x+14}" y2="{y+38}" stroke="#000"/><text x="{x}" y="{y+56}" text-anchor="middle" font-size="12">{n}</text>')
    DASH = 'stroke-dasharray="6 4"'
    ln = lambda a, b, c, d, dash=False: f'<line x1="{a}" y1="{b}" x2="{c}" y2="{d}" stroke="#333" {DASH if dash else ""}/>'
    uc = {"login": (520, 90, "Login"), "lock": (850, 90, "Lock Account (5 failures)"), "verify": (520, 170, "Verify Email"), "reset": (520, 250, "Reset Password"),
          "prof": (520, 330, "Update Own Profile"), "list": (520, 440, "View / Search Users"), "susp": (520, 520, "Suspend / Unsuspend User"),
          "del": (520, 600, "Delete User"), "cat": (850, 440, "Manage Event Categories"), "audit": (850, 600, "View Audit Log (planned)"), "mail": (850, 250, "Send Email")}
    s = f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Arial">'
    s += f'<rect width="{W}" height="{H}" fill="#fff"/><rect x="250" y="20" width="800" height="710" fill="none" stroke="#000"/><text x="650" y="45" text-anchor="middle" font-size="14" font-weight="bold">EMS — Account, Access and Administration use cases</text>'
    for k, (x, y, t) in uc.items():
        s += ell(x, y, t, "#d5e8d4" if k in ("mail",) else ("#f8cecc" if k in ("lock", "audit") else "#dae8fc"))
    s += actor(80, 250, "User (any role)") + actor(80, 540, "Admin") + actor(1040, 250, "Mail Service")
    for k in ("login", "verify", "reset", "prof"): s += ln(98, 242, uc[k][0] - 118, uc[k][1])
    for k in ("list", "susp", "del", "cat", "audit"): s += ln(98, 532, uc[k][0] - 118, uc[k][1])
    s += ln(98, 532, uc["login"][0] - 100, uc["login"][1] + 22)
    s += ln(uc["lock"][0] - 118, uc["lock"][1], uc["login"][0] + 118, uc["login"][1], True) + '<text x="690" y="82" font-size="11" text-anchor="middle">&lt;&lt;extend&gt;&gt;</text>'
    s += ln(uc["verify"][0] + 100, uc["verify"][1] + 15, uc["mail"][0] - 100, uc["mail"][1] - 15, True) + ln(uc["reset"][0] + 118, uc["reset"][1], uc["mail"][0] - 118, uc["mail"][1], True)
    s += '<text x="700" y="210" font-size="11">&lt;&lt;include&gt;&gt;</text><text x="700" y="268" font-size="11">&lt;&lt;include&gt;&gt;</text>'
    s += ln(uc["mail"][0] + 118, uc["mail"][1], 1022, 242)
    s += ln(uc["susp"][0] + 118, uc["susp"][1] - 10, uc["audit"][0] - 100, uc["audit"][1] - 20, True) + ln(uc["del"][0] + 118, uc["del"][1], uc["audit"][0] - 118, uc["audit"][1], True)
    s += '<text x="705" y="560" font-size="11">&lt;&lt;include&gt;&gt;</text><text x="690" y="640" font-size="11">&lt;&lt;include&gt;&gt;</text>'
    s += '<text x="260" y="715" font-size="11" fill="#b00020">Red = not delivered in main (lockout, audit log); see SRS 5.1 and SAD 4.6.</text></svg>'
    open(os.path.join(OUT, "USECASE_DIAGRAM_2.svg"), "w").write(s)

# --------------------------------------------------------------------------- shared lookups
def frs_by_id(): return {f[0]: f for f in FRS}

def tests_for():
    m = {}
    for parent, cases in TESTS.items():
        for cid, title, exp, subs, run, ver in cases:
            for s in subs: m.setdefault(s, []).append(f"{parent.replace('-','')}-{cid}")
    return m

def fid(parent, cid): return f"{parent.replace('-','')}-{cid}"

def srs_rtm_rows():
    tm = tests_for(); rows = []
    for f in FRS:
        rows.append([f[0], f[1], "4", f[10], f[11], ", ".join(tm.get(f[0], [])), "P"])
    nftmap = {}
    for n in NFT: nftmap.setdefault(n[1], []).append(n)
    stat = {"NFR-001": "A", "NFR-002": "P", "NFR-003": "P", "NFR-004": "A", "NFR-005": "A", "NFR-006": "A", "NFR-007": "A"}
    for n in NFRS:
        tcs = ", ".join(x[0] for x in nftmap.get(n[0], [])); secs = {"NFR-003": "SEC_01, SEC_06, SEC_12", "NFR-004": "SEC_03, SEC_04, SEC_05, SEC_09, SEC_10, SEC_11, SEC_13"}.get(n[0], "")
        rows.append([n[0], n[2][:60] + "…", "5", "cross-cutting (SAD 3.8)", "see SAD 3.8", (tcs + (", " if tcs and secs else "") + secs), stat[n[0]]])
    return rows

# --------------------------------------------------------------------------- SRS
def build_srs():
    usecase2_svg()
    b = header("Software Requirements Specification (SRS)", "Event Management System — IEEE 830 / ISO 29148 structure", "3.0", "Final (Sprint 2 frozen) — updated 13 Nov 2026", "Restructured to the course SRS template; 20 FRs, 7 NFRs, security objectives/requirements, use case diagrams and RTM added")
    b += """<h3>Table of Contents</h3><ol><li>Introduction</li><li>Overall description</li><li>External interface requirements</li><li>System features (detailed)</li><li>Non-functional requirements (detailed) — 5.1 Security</li><li>Quality attributes &amp; acceptance tests</li><li>System models and diagrams (UML use cases)</li><li>Requirements Traceability Matrix (RTM)</li></ol>"""
    b += """<h1 class="pb">1. Introduction</h1><h2>1.1 Purpose</h2><p>This document is the Software Requirements Specification (SRS) for the Event Management System (EMS). It defines the functional and non-functional requirements, external interfaces, security objectives and requirements, and the acceptance and verification criteria for the system. It is the baseline against which the SAD (Documents/SAD_DOCUMENT.pdf) and the Test Plan (Documents/TEST-PLAN_DOCUMENT.pdf) are traced.</p>
<h2>1.2 Scope</h2><p>EMS is a web application through which Participants discover and register for campus events, Organizers create and manage events and their registrations, and Admins manage user accounts, event categories and platform statistics. It covers account lifecycle, role-based access, event management, registration with capacity control and waitlisting, notifications, reporting and export. It excludes payments/ticketing, native mobile apps and integration with external calendars.</p>
<h2>1.3 Audience</h2><p>Developers, QA engineers, security reviewers, the course instructor/evaluators, and the project team members listed above.</p>
<h2>1.4 Definitions, acronyms and abbreviations</h2>
""" + table(["Term", "Meaning"], [["EMS", "Event Management System"], ["FR / NFR", "Functional / Non-Functional Requirement"], ["RBAC", "Role-Based Access Control"], ["IDOR", "Insecure Direct Object Reference"], ["CSRF / XSS / SQLi", "Cross-Site Request Forgery / Cross-Site Scripting / SQL injection"], ["TLS", "Transport Layer Security"], ["WCAG", "Web Content Accessibility Guidelines"], ["RPO / RTO", "Recovery Point / Recovery Time Objective"], ["RTM", "Requirements Traceability Matrix"], ["SRSec", "Security Requirements Specification (Documents/SECURITY_DOCUMENT.pdf)"]])
    b += """<h1>2. Overall description</h1><h2>2.1 Product perspective</h2><p>EMS is a self-contained web application (Next.js App Router, TypeScript) backed by a PostgreSQL database and an SMTP service for transactional email. It has no dependency on other campus systems. Users access it through a standard web browser on desktop or mobile.</p>
<h2>2.2 Major product functions</h2><ul><li>Account creation with email verification, login, password reset (FR-001a – FR-002b)</li><li>Role-based access, profile update, admin account management (FR-003a – FR-003c)</li><li>Create, edit, cancel/delete events; notify participants (FR-004a – FR-005b)</li><li>Browse, search, filter events; admin-managed categories (FR-006a – FR-006c)</li><li>Register, capacity check, waitlist with auto-promotion, self-cancellation, reminders (FR-007 – FR-009b)</li><li>Registration counts, CSV/PDF export, platform statistics (FR-010a – FR-010b)</li></ul>
<h2>2.3 User roles and characteristics</h2><ul><li><b>Participant:</b> general campus user; expects to find and register for an event in minutes without training.</li><li><b>Organizer:</b> staff or student who publishes and manages events and needs accurate attendee data.</li><li><b>Admin:</b> platform administrator who manages accounts, categories and monitors statistics.</li><li><b>Mail service (external actor):</b> SMTP provider that delivers notifications.</li></ul>
<h2>2.4 Operating environment</h2><p>Server: Node.js 20+, Next.js 14, PostgreSQL 16, deployed on Vercel with managed PostgreSQL. Client: latest two versions of Chrome, Firefox, Safari and Edge; screens from 320 px wide upward.</p>
<h2>2.5 Constraints</h2><p>Team of three students over three sprints; single deployable web application; all database access through an ORM; transactional email only (no SMS); TLS enforced by the hosting platform; open-source dependencies only.</p>
<h1>3. External interface requirements</h1><h2>3.1 User interfaces</h2><p>Responsive web UI with role-specific navigation; clear error messages (e.g. “event full”, “already registered”); WCAG 2.1 AA conformance (NFR-006).</p>
<h2>3.2 Hardware interfaces</h2><p>None beyond standard client devices; no dedicated hardware.</p>
<h2>3.3 Software interfaces</h2><ul><li>PostgreSQL via Prisma ORM (authoritative data model: prisma/schema.prisma).</li><li>SMTP (nodemailer) for verification, reset, registration, cancellation, promotion, update and reminder emails.</li><li>JSON REST API under <code>/api</code> (documented in SAD 4.3).</li></ul>
<h2>3.4 Communications</h2><p>HTTPS with TLS 1.2 or higher for all traffic; session cookie HttpOnly, SameSite=Lax and Secure in production; SMTP over TLS.</p>
<div class="note"><b>Counts (template minimum 15 FRs / 5 NFRs / 2 security objectives / 5 security requirements):</b> this SRS specifies <b>20 FRs</b>, <b>7 NFRs</b>, <b>3 security objectives</b> and <b>12 security requirements</b>.</div>"""
    b += '<h1 class="pb">4. System features (detailed)</h1><p>Each requirement has acceptance criteria and test references (test IDs are defined in the Test Plan; format <code>FRnnn-UT_01</code>). IDs follow <code>FR-nnn[a-c]</code>; the letter suffix matches the backlog issue on the GitHub Project board.</p>'
    groups = [("4.1 Accounts, authentication and access", "Register, verify, authenticate, recover and administer user accounts.", ["FR-001a","FR-001b","FR-002a","FR-002b","FR-003a","FR-003b","FR-003c"]),
              ("4.2 Event management and discovery", "Organizers manage events; users discover them.", ["FR-004a","FR-004b","FR-005a","FR-005b","FR-006a","FR-006b","FR-006c"]),
              ("4.3 Registration", "Register with capacity control, waitlist and notifications.", ["FR-007","FR-008","FR-009a","FR-009b"]),
              ("4.4 Reporting", "Counts, exports and platform statistics.", ["FR-010a","FR-010b"])]
    fm = frs_by_id(); tm = tests_for()
    for name, desc, ids in groups:
        rows = []
        for i in ids:
            f = fm[i]
            rows.append([i, f[2], "Functional", f[3], f[4], f"{f[5]} Tests: {', '.join(tm.get(i, []))}", f"Backlog #{f[6]}, {f[7]}, {f[8]}, {f[9]} pts"])
        b += f"<h2>{name}</h2><p>{e(desc)}</p>" + table(["Req ID", "Requirement (shall…)", "Type", "Priority", "Source / Stakeholder", "Acceptance criteria / Test case ref", "Comments / Dependencies"], rows)
    b += '<h1 class="pb">5. Non-functional requirements (detailed)</h1><p>NFRs are measurable and tied to test cases in the Test Plan §5.3 and §5.1.</p>'
    b += table(["Req ID", "Requirement", "Category", "Priority", "Acceptance criteria / Measurement", "Backlog"], [[n[0], n[2], n[1], n[3], n[4], (f"#{n[5]}, {n[6]}, {n[7]}, {n[8]} pts" if n[5] else "no backlog item")] for n in NFRS])
    b += '<h2>5.1 Security</h2><h3>5.1.1 Security objectives</h3>' + table(["ID", "Objective", "Description"], SEC_OBJ)
    b += '<h3>5.1.2 Security requirements</h3><p>Derived from Documents/SECURITY_DOCUMENT.pdf (SRSec). “Status in main” is the verified state of the delivered code as of 13 Nov 2026.</p>'
    b += table(["Req ID", "Requirement (shall…)", "SRSec §", "Objective", "NFR", "Test case ref", "Status in main", "Where / note"], [[s[0], s[1], s[2], s[3], s[4], s[5], res(s[6]), s[7]] for s in SECREQS], raw_cols=(6,))
    b += """<h1>6. Quality attributes &amp; acceptance tests</h1><ul><li><b>Exit criteria for acceptance:</b> all High-priority FRs implemented and verified, no critical NFR failure open without a documented deviation, and the RTM shows every requirement mapped to at least one executed test case.</li><li><b>Acceptance test suites:</b> Accounts, Events, Registration &amp; Concurrency, Reporting, Performance, Security, Accessibility (Test Plan §5).</li><li><b>Documented deviations</b> (requirements not fully met at the Sprint 2 freeze) are listed in SAD 4.6 and in the Test Plan §14.</li></ul>
<h1 class="pb">7. System models and diagrams</h1><h2>7.1 UML use case diagrams</h2><p>Two use case diagrams are provided: (1) the overall system view; (2) the account, access and administration view with the security-related use cases. Detailed use case flows (main and alternate) are in Documents/USECASE_FLOW.pdf.</p>
<div class="fig"><img src="../USECASE_DIAGRAM.svg" style="width:100%"><div class="cap">Figure 1 — Use case diagram 1: Event Management System (overall)</div></div>
<div class="fig"><img src="../USECASE_DIAGRAM_2.svg" style="width:100%"><div class="cap">Figure 2 — Use case diagram 2: account, access and administration (includes security use cases)</div></div>"""
    b += '<h1 class="pb">8. Requirements Traceability Matrix (RTM)</h1><p>Status legend: <b>P</b> = verified passed; <b>A</b> = accepted/documented deviation or partially met (see Test Plan §14); <b>N</b> = not yet verified. The separate lists SRS→Test and Security→Test are in Documents/TRACEABILITY_MATRICES.pdf.</p>'
    b += table(["Req ID", "Requirement short", "Section", "Design (SAD component)", "Module", "Test case(s)", "Status"], srs_rtm_rows())
    return page("SRS", b)

# --------------------------------------------------------------------------- SAD
def build_sad():
    b = header("Software Architecture and Design Specification", "Event Management System", "3.0", "Final (Sprint 2 frozen) — updated 13 Nov 2026", "Restructured to the course SAD template; accuracy fixes to security architecture (session TTL, demo-role fallback); deviations updated")
    b += """<h1 class="pb">1. Introduction</h1><h2>1.1 Purpose</h2><p>This document specifies the architecture and design of EMS: the architectural pattern, component decomposition, traceability to the SRS, the security architecture, and the detailed design of two key workflows, the API and error handling.</p>
<h2>1.2 Scope</h2><p>The Next.js web application, its server-side API, business-logic layer and PostgreSQL data store. Infrastructure provisioning and CI/CD are covered only where they affect error handling or deployment fallbacks.</p>
<h2>1.3 Audience</h2><p>Developers, QA engineers, security auditors, instructors/evaluators and maintainers.</p>
<h2>1.4 Definitions</h2>""" + table(["Term", "Meaning"], [["ADR", "Architecture Decision Record"], ["RBAC", "Role-Based Access Control"], ["ORM", "Object-Relational Mapper (Prisma)"], ["SERIALIZABLE tx", "PostgreSQL transaction at SERIALIZABLE isolation"], ["IDOR", "Insecure Direct Object Reference"], ["STRIDE", "Spoofing, Tampering, Repudiation, Information disclosure, DoS, Elevation of privilege"], ["TLS / SMTP", "Transport Layer Security / Simple Mail Transfer Protocol"]])
    b += """<h1>2. Document Overview</h1><h2>2.1 How to use this document</h2><p>Section 3 gives the architecture (diagrams, components, pattern, stack, risks, traceability, security). Section 4 gives the design (sequence diagrams, API, error handling, UX, open issues and deviations). Read 3.8 to find which component implements a requirement.</p>
<h2>2.2 Related documents</h2><ul><li>Documents/SRS_DOCUMENT.pdf — requirements (20 FRs, 7 NFRs, security requirements, RTM)</li><li>Documents/TEST-PLAN_DOCUMENT.pdf — test plan, security validation, results</li><li>Documents/SECURITY_DOCUMENT.pdf — SRSec</li><li>Documents/USECASE_DIAGRAM.svg, USECASE_DIAGRAM_2.svg, USECASE_FLOW.pdf, COMPONENT_DIAGRAM.svg</li><li>Documents/TRACEABILITY_MATRICES.pdf — SRS→Test and Security→Test lists</li></ul>
<h1>3. Architecture</h1><h2>3.1 Goals &amp; constraints</h2><p><b>Goals:</b> correct seat accounting under concurrency (no overbooking), secure role-based access, simple deployment, testability. <b>Constraints:</b> three-person team and three sprints, free-tier hosting, single deployable unit, ORM-only data access, SMTP-only notifications.</p>
<h2>3.2 Stakeholders &amp; concerns</h2>""" + table(["Stakeholder", "Concerns"], [["Participants", "Fast browsing and registration, clear errors, accessibility"], ["Organizers", "Accurate registrations, safe edit/cancel, attendee export"], ["Admins", "Account control, auditability, statistics"], ["Evaluators / instructors", "Traceability, security, documented deviations"], ["Developers", "Modularity, testability, ≥80% core coverage"]])
    b += """<h2>3.3 Component (UML) diagram</h2><div class="fig"><img src="img/component.png"><div class="cap">Figure 1 — UML component diagram: five subsystems (EventManagement, Registration, Notification, Reporting, Accounts), provided/required interfaces and the external SMTP dependency.</div></div>
<h2>3.4 Component descriptions</h2>""" + table(["Subsystem", "Component", "Responsibility", "Key files"], [["EventManagement", "EventCatalog", "Browse, search and filter active events", "app/events/page.tsx, lib/eventFilters.ts"], ["EventManagement", "EventManager", "Create, edit, cancel events (organizer-owned)", "app/events/create, app/api/events/[id]/route.ts"], ["EventManagement", "Categories", "Admin-managed category list", "lib/categories.ts, app/admin/categories"], ["Registration", "CapacityCheck", "Atomic seat-count enforcement", "lib/registration.ts (registerForEvent)"], ["Registration", "Registration", "Register for / cancel a registration", "app/api/events/[id]/register, app/api/registrations"], ["Registration", "Waitlist", "FIFO waitlist with auto-promotion", "lib/registration.ts"], ["Notification", "NotificationService", "Templated transactional email", "lib/emailTemplates.ts, lib/mailer.ts"], ["Reporting", "Reports", "CSV/PDF export, statistics", "lib/export.ts, lib/stats.ts"], ["Accounts", "Authentication", "Signup, login, verification, reset, session", "lib/auth.ts, lib/session.ts, lib/tokens.ts"], ["Accounts", "UserAccounts", "Admin view/suspend/delete users", "app/api/admin/users"]])
    b += """<h2>3.5 Chosen architecture pattern and rationale</h2><p><b>Layered (N-tier) modular monolith</b> in one Next.js application: Presentation (React components) → API/Controller (route handlers: validate, call one business function, map to HTTP) → Business Logic (lib/*: capacity, waitlist, RBAC, notifications) → Data Access (Prisma/PostgreSQL). Each layer calls only the one below it. Two cross-cutting mechanisms sit alongside: a per-event in-process mutex plus SERIALIZABLE transactions, and a notification dispatcher invoked only after commit.</p>
<p><b>Rationale:</b> clear separation of concerns, easy unit/integration testing, minimal operational overhead for a three-person team. <b>Rejected:</b> microservices (needless network and deployment complexity at this scale); client-side rules (cannot be trusted for capacity or roles).</p>
<h2>3.6 Technology stack &amp; data stores</h2>""" + table(["Concern", "Choice"], [["Language / framework", "TypeScript, Next.js 14 (App Router), React 18"], ["Database", "PostgreSQL 16 via Prisma 5 (six entities: User, Event, Registration, Category, VerificationToken, PasswordResetToken)"], ["Validation", "zod schemas (lib/validation.ts)"], ["Auth", "bcryptjs (cost 12), HMAC-signed session cookie (lib/session.ts)"], ["Email", "nodemailer (SMTP; jsonTransport in tests)"], ["Testing / CI", "node:test via tsx, GitHub Actions with a Postgres service container"], ["Hosting", "Vercel + managed PostgreSQL"]])
    b += "<h2>3.7 Risks &amp; mitigations</h2>" + table(["Risk", "Mitigation"], [["Overbooking under concurrent requests", "withEventLock + SERIALIZABLE transactions + unique (userId, eventId); verified at 100 concurrent requests"], ["Mail provider failure", "Notification runs after commit and never fails the primary action; failures counted and logged"], ["Database unreachable", "Limited in-memory fallback for demo/tests; capacity guarantees require the real DB"], ["Latency at 500 concurrent users (NFR-001) not met in local test", "Tracked deviation; investigate connection pooling and per-event lock scope"], ["Client-claimed role fallback (demo header) accepted without session", "Tracked deviation; gate fallback to non-production"], ["Unreviewed merges (PRs #46/#48/#49)", "Reverted and re-merged after review; branch protection recommended"]])
    b += "<h2>3.8 Traceability to requirements</h2><p>Mirrors the SRS RTM (SRS §8) against the components above.</p>" + table(["Requirement", "Description", "Primary component(s)", "Supporting NFR(s)"], [["FR-001a/b", "Account creation + email verification", "Authentication", "NFR-003"], ["FR-002a/b", "Login, password reset", "Authentication", "NFR-003, NFR-004"], ["FR-003a/b/c", "RBAC, profile, admin user management", "Authentication, UserAccounts", "NFR-003, NFR-004"], ["FR-004a/b", "Create / edit events", "EventManager", "NFR-005"], ["FR-005a/b", "Cancel events, notify participants", "EventManager, NotificationService", "NFR-004, NFR-007"], ["FR-006a/b/c", "Browse, search, filter, categories", "EventCatalog, Categories", "NFR-001, NFR-002, NFR-006"], ["FR-007", "Register for events", "Registration", "NFR-001, NFR-002, NFR-005, NFR-006"], ["FR-008", "Capacity check / overbooking prevention", "CapacityCheck", "NFR-001, NFR-002, NFR-006, NFR-007"], ["FR-009a/b", "Waitlist, self-cancellation, notifications", "Waitlist, Registration, NotificationService", "NFR-002, NFR-007"], ["FR-010a/b", "Counts, export, statistics", "Reports", "NFR-001, NFR-002, NFR-005"]])
    b += """<h2>3.9 Security architecture</h2><h3>Threat model (STRIDE)</h3>""" + table(["Threat", "Example", "Mitigation in design", "Status"], [["Spoofing", "Forged session cookie; claimed role", "HMAC-SHA256 signed cookie, constant-time compare; real-session-only requireAdmin", "Partly met — demo role fallback still trusted for Organizer/Participant routes (SEC_13)"], ["Tampering", "Edit another organizer's event; malformed input", "Ownership checks (IDOR), zod validation, parameterized Prisma queries", "Met"], ["Repudiation", "Admin action denied later", "Durable audit log", "Not met in main (SEC_10)"], ["Information disclosure", "Password leak, account enumeration", "bcrypt hashes, hashed tokens, generic login/reset responses, TLS", "Met"], ["Denial of service", "Brute-force login, request floods", "Account lockout, rate limiting", "Not met in main (SEC_03); no rate limiting"], ["Elevation of privilege", "Participant calls organizer API", "Server-side RBAC re-derived from the DB row on every request", "Met for real sessions"]])
    b += """<h3>Controls as implemented (verified 13 Nov 2026)</h3><ul>
<li><b>Passwords:</b> bcrypt cost 12; never logged (SRSec 2.1).</li>
<li><b>Session:</b> cookie <code>userId.expiresAt.signature</code>, HMAC-SHA256, verified with <code>timingSafeEqual</code>; HttpOnly, SameSite=Lax, Secure in production. The session carries only a user id and expiry, so suspension or role change applies on the next request. <b>Expiry is a fixed 7-day absolute TTL</b>; the SRS requires 30 minutes of inactivity (deviation D3).</li>
<li><b>RBAC:</b> <code>requireAdmin</code> accepts only a real session. <code>requireOrganizer</code> and the participant routes use <code>getAuthUserFromRequest</code>, which falls back to a client-supplied <code>x-user-role</code> header or <code>event_session_role</code> cookie when no session exists. This demo fallback (used by the role-switcher UI) means an unauthenticated caller can act as the shared demo Organizer/Participant; it does <b>not</b> grant Admin. Earlier revisions of this document incorrectly said the header only affected the UI. (deviation D4)</li>
<li><b>Ownership/IDOR:</b> organizer must equal <code>event.organizerId</code> to edit, cancel or export.</li>
<li><b>Tokens:</b> random 32-byte, sha256-hashed at rest, single-use (<code>usedAt</code>), 24 h (verification) / 1 h (reset).</li>
<li><b>Transport / at rest:</b> TLS 1.2+ and storage encryption provided by the hosting platform (not independently scanned).</li>
<li><b>Injection / XSS:</b> Prisma only (no raw SQL); zod validation; <code>escapeHtml()</code> in email templates; React output escaping; CSV formula-injection neutralization.</li>
<li><b>Concurrency as an integrity control:</b> <code>withEventLock</code> + <code>withSerializableTransaction</code> (one retry on P2034); cancellation guarded by <code>UPDATE … WHERE status='ACTIVE'</code> so participants are notified at most once.</li></ul>
<h3>Security requirement coverage</h3>""" + table(["Req", "SRSec §", "Requirement", "Status", "Where / note"], [[s[0], s[2], s[1], res(s[6]), s[7]] for s in SECREQS], raw_cols=(3,))
    b += """<h1 class="pb">4. Design</h1><h2>4.1 Design overview</h2><p>Layered modules for separation of concerns. The persistent model has six entities; the unique constraint on <code>Registration(userId, eventId)</code> is what finally enforces duplicate-registration prevention even if application checks were bypassed.</p>""" + table(["Entity", "Key fields", "Relationships"], [["User", "id, name, email (unique), passwordHash, role, verified, suspended", "1—N Event (organizer), 1—N Registration"], ["Event", "id, name, date, time, venue, category, categoryId, capacity, status", "N—1 User, 1—N Registration, N—1 Category"], ["Registration", "id, userId, eventId, status (CONFIRMED|WAITLISTED|CANCELLED), reminderSentAt", "N—1 User, N—1 Event; unique (userId, eventId)"], ["Category", "id, name (unique)", "1—N Event"], ["VerificationToken", "id, userId, tokenHash (unique), expiresAt, usedAt", "N—1 User"], ["PasswordResetToken", "id, userId, tokenHash (unique), expiresAt, usedAt", "N—1 User"]])
    b += """<h2>4.2 UML sequence diagrams</h2><p>Two sequence diagrams covering two project-specific flows, traced from the code.</p>
<div class="fig"><img src="img/seq_register.png" style="max-height:150mm"><div class="cap">Figure 2 — Sequence diagram 1: registering for an event (FR-007 / FR-008 / FR-009a). The lock and transaction decide CONFIRMED vs WAITLISTED atomically; email is sent after commit.</div></div>
<div class="fig"><img src="img/seq_cancel.png" style="max-height:170mm"><div class="cap">Figure 3 — Sequence diagram 2: organizer cancels an event (FR-005a / FR-005b). The status=ACTIVE guard in the locked transaction prevents two concurrent cancels from both notifying.</div></div>
<h2 class="pb">4.3 API design</h2><p>All endpoints are under <code>/api</code> (Next.js route handlers), JSON bodies. Auth: Public, Session, Organizer (owner), Admin (real session only).</p>""" + table(["Endpoint", "Methods", "Auth", "Purpose"], [["/api/auth/signup", "POST", "Public", "Create account, send verification email"], ["/api/auth/verify", "POST", "Public", "Consume verification token"], ["/api/auth/login", "POST", "Public", "Verify credentials, issue session cookie"], ["/api/auth/logout", "POST", "Session", "Clear session cookie"], ["/api/auth/forgot-password", "POST", "Public", "Send password-reset link"], ["/api/auth/reset-password", "POST", "Public", "Consume reset token, set password"], ["/api/auth/me", "GET, PATCH", "Session", "Read / update own profile"], ["/api/events", "GET, POST", "GET public · POST Organizer", "List/search events · create event"], ["/api/events/{id}", "GET, PATCH, PUT, DELETE", "GET public · others Organizer (owner)", "Fetch · cancel · edit · delete"], ["/api/events/{id}/register", "GET, POST, DELETE", "Session", "Check / create / cancel registration"], ["/api/events/{id}/waitlist", "GET, POST, DELETE", "Session", "Waitlist position / join / leave"], ["/api/events/{id}/export", "GET", "Organizer (owner) or Admin", "CSV/PDF/JSON participant export"], ["/api/registrations", "GET, POST, DELETE", "Session", "Own registrations"], ["/api/categories", "GET", "Public", "Active categories"], ["/api/reminders", "GET, POST", "Internal/cron", "Dispatch event reminders"], ["/api/admin/users", "GET", "Admin", "List accounts"], ["/api/admin/users/{id}", "PATCH, DELETE", "Admin", "Suspend/unsuspend · delete"], ["/api/admin/categories[/{id}]", "GET, POST, PATCH, DELETE", "Admin", "Manage categories"], ["/api/admin/stats (alias /statistics)", "GET", "Admin", "Platform-wide counts"]])
    b += "<h3>Interface definitions (two components in detail)</h3>" + table(["Item", "POST /api/events/{id}/register (Registration)", "PATCH /api/events/{id} (EventManager)"], [["Request", "{ waitlist?: boolean } + session cookie", "{ action: \"cancel\" } + session cookie (owner)"], ["Success", "201 { id, userId, eventId, status: CONFIRMED|WAITLISTED, waitlistPosition? }", "200 { event, notifications: { recipients, sent, failed } }"], ["Errors", "400 event full / event cancelled / invalid body · 401 not authenticated · 403 suspended · 404 event or user not found · 409 already registered", "401 not authenticated · 403 not the owner / not an organizer · 404 event not found · 409 already cancelled · 500 unexpected (generic message)"], ["Guarantees", "Exactly one record per (user, event); never exceeds capacity; email after commit", "Participants notified at most once; mail failure does not fail the cancel"]])
    b += table(["Item", "POST /api/auth/login (Authentication)"], [["Request", "{ email, password }"], ["Success", "200 { id, name, email, role } + Set-Cookie session (HttpOnly; SameSite=Lax; Secure in production)"], ["Errors", "400 invalid body · 401 invalid email or password (same message for both) · 403 not verified / suspended"]])
    b += """<h2>4.4 Error handling, logging &amp; monitoring</h2><h3>Response shape and status codes</h3><p>Every route returns <code>NextResponse.json(body, { status })</code>. Errors are a flat <code>{ error }</code> (plus field errors for validation), never a stack trace.</p>""" + table(["Status", "Meaning"], [["400", "Malformed JSON or failed zod validation; business rule such as event full"], ["401", "No valid session where required"], ["403", "Valid session but wrong role, not the owner, or suspended"], ["404", "Event/user/registration does not exist"], ["409", "State conflict: already registered/cancelled, capacity below confirmed count, stale edit"], ["500", "Unexpected error: logged via console.error, generic message to the client"]])
    b += "<h3>Prisma error translation</h3>" + table(["Code", "Meaning", "Handling"], [["P2002", "Unique constraint (duplicate email or registration)", "409 duplicate"], ["P2025", "Conditional update/delete matched no row", "404 or 409 depending on call site (e.g. already cancelled)"], ["P2034", "Write conflict under SERIALIZABLE", "Retried once, then 500"], ["P2021", "Optional table missing in an environment", "Treated as 'no category relation'"], ["PrismaClientInitializationError", "Database unreachable", "In-memory fallback for demo/tests (no capacity guarantees)"]])
    b += """<ul><li><b>Notification failures never fail the primary action</b> (<code>notifyParticipantsSafely</code> returns <code>{recipients, sent, failed}</code>).</li><li><b>Optimistic concurrency</b> on edits via <code>expectedUpdatedAt</code> (409 on mismatch).</li><li><b>Logging:</b> no sensitive data (passwords, tokens) in log lines. Currently <code>console.error</code> only — no durable central log (deviation D5).</li><li><b>Monitoring:</b> GitHub Actions CI on every push/PR (typecheck, tests, coverage, build); hosting-platform logs. No uptime monitoring configured (deviation D6).</li></ul>
<h2>4.5 UX design</h2><p>Role-aware navigation, quick-register on event cards, seat availability shown on cards, explicit error messages for full/duplicate/cancelled cases, confirmation dialogs for cancel/delete, and the WCAG 2.1 AA / 320 px responsive work tracked under NFR-006 (PR #63, open). axe-core reports 0 violations on the scanned pages; 7 of 9 pages overflow horizontally at 320 px on main.</p>
<h2>4.6 Open issues, deviations and next steps</h2><p>Deviations from the initial SRS/SAD, documented for the demo (IDs referenced from the Test Plan):</p>"""
    b += table(["ID", "Deviation", "Requirement", "Tracking"], [["D1", "FR-004b, FR-006b and FR-006c were merged then reverted (unreviewed merges) and re-merged after review; the architecture here is the re-reviewed state.", "FR-004b/006b/006c", "PRs #46–#54"], ["D2", "NFR-001 latency targets not met at 500 concurrent users in the local load test (list p95 8.3 s; 500 simultaneous registrations p95 121.7 s).", "NFR-001", "Test NFT_02; no backlog item (#56 removed)"], ["D3", "Sessions use a 7-day absolute TTL; no 30-minute inactivity timeout.", "NFR-004, SRSec 2.2", "SEC_11; issue #59"], ["D4", "Demo role fallback (x-user-role header / event_session_role cookie) is accepted by Organizer/Participant routes without a session.", "NFR-004, SRSec 3.1", "SEC_13; issue #59"], ["D5", "Account lockout (SRSec 2.3) and durable audit/central log (SRSec 6.1/6.2) are not in main; uncommitted local work exists but is untested and currently fails `tsc`.", "NFR-004, NFR-007", "SEC_03, SEC_10; issues #59, #62 (PR #64 open)"], ["D6", "Uptime monitoring and a scheduled daily backup are not configured; a manual restore drill passed locally.", "NFR-005", "NFT_07"], ["D7", "NFR-006: 320 px horizontal overflow on main and no usability study; fixed in open PR #63.", "NFR-006", "NFT_08, NFT_11; issue #61"], ["D8", "CSRF protection is SameSite=Lax only (no anti-CSRF token).", "SRSec 5.3", "SEC_09"], ["D9", "Encryption at rest and TLS rely on the hosting platform; PII is not field-encrypted.", "SRSec 4.1/4.2", "SEC_06"]])
    b += """<p><b>Next steps:</b> gate the demo role fallback to non-production, add an inactivity timeout, merge reviewed lockout/audit-log work with tests, review and merge PRs #63/#64, profile registration latency under load, configure backups and uptime monitoring.</p>
<h1>5. Appendices</h1><h2>5.1 Glossary</h2><p>ADR, RBAC, IDOR, STRIDE, SERIALIZABLE transaction, ORM, TLS, SMTP — see §1.4.</p>
<h2>5.2 References</h2><ul><li>IEEE 42010 (architecture description); IEEE 830 / ISO/IEC/IEEE 29148 (requirements)</li><li>OWASP Top 10 and ASVS; NIST SP 800-160</li><li>Documents/SRS_DOCUMENT.pdf, SECURITY_DOCUMENT.pdf, TEST-PLAN_DOCUMENT.pdf; prisma/schema.prisma</li></ul>
<h2>5.3 Tools</h2><p>draw.io (use case and component diagrams), sequence-diagram generator for Figures 2–3, Prisma, GitHub Projects/Actions, axe-core, PostgreSQL tools (pg_dump/pg_restore).</p>"""
    return page("SAD", b)

# --------------------------------------------------------------------------- Test plan
def build_tp():
    tm = tests_for()
    n_pass = sum(1 for n in NFT if n[3] == "Pass"); s_pass = sum(1 for s in SEC if s[3] == "Pass")
    b = header("Software Test Plan (STP)", "Event Management System — IEEE 829 structure", "3.0", "Final — executed 13 Nov 2026", "Restructured to the course STP template (sections 1–15, 5.1 security validation); all tests re-run; load, restore and accessibility tests executed; 16 security cases; fail→fix demonstration")
    b += """<h1 class="pb">1. Introduction</h1><p><b>Purpose:</b> defines the test plan for EMS v1.0 — objectives, scope, strategy, environment, schedule, responsibilities, and the functional, non-functional and security test cases with their results.</p>
<p><b>Scope:</b> all 20 functional requirements (FR-001a – FR-010b), all 7 non-functional requirements (NFR-001 – NFR-007) and the security requirements SR-001 – SR-012. Third-party services (PostgreSQL engine, SMTP provider, Vercel) are not re-tested.</p>
<p><b>References:</b> SRS v3.0, SAD v3.0, SRSec, tests/*.test.ts, scripts/test_fr*.ts, .github/workflows/ci.yml, docs/reports/*.</p>
<p><b>Definitions:</b> UT/IT/ST = unit/integration/system test; SEC = security validation case; NFT = non-functional test; RTM = requirements traceability matrix; “live” = executed against a running production build of main.</p>
<h1>2. Test Items</h1>""" + table(["Item", "Requirement(s)", "Primary module(s)"], [["Account signup &amp; email verification".replace("&amp;", "&"), "FR-001a/b", "app/api/auth/signup, verify"], ["Login &amp; password reset".replace("&amp;", "&"), "FR-002a/b", "app/api/auth/login, forgot-password, reset-password"], ["RBAC, profile, admin user management", "FR-003a/b/c", "lib/auth.ts, app/api/auth/me, app/api/admin/users"], ["Event creation &amp; editing".replace("&amp;", "&"), "FR-004a/b", "app/api/events, lib/registration.ts"], ["Event cancellation &amp; notifications".replace("&amp;", "&"), "FR-005a/b", "app/api/events/[id], lib/registration.ts"], ["Discovery, search, filter, categories", "FR-006a/b/c", "lib/eventFilters.ts, lib/categories.ts"], ["Registration &amp; duplicate prevention".replace("&amp;", "&"), "FR-007", "app/api/events/[id]/register"], ["Capacity check &amp; concurrency".replace("&amp;", "&"), "FR-008", "lib/registration.ts"], ["Waitlist, self-cancellation, reminders", "FR-009a/b", "lib/registration.ts, app/api/reminders"], ["Reporting, export, statistics", "FR-010a/b", "lib/export.ts, lib/stats.ts"], ["Non-functional behaviour and security controls", "NFR-001–007, SR-001–012", "whole system"]])
    # section 3
    rows = []
    for f in FRS: rows.append([f[0], f[1], ", ".join(tm.get(f[0], [])), "Functional"])
    for n in NFRS: rows.append([n[0], n[1], ", ".join(x[0] for x in NFT if x[1] == n[0]), "Non-functional"])
    b += "<h1>3. Features to be Tested</h1><p>Every requirement in the SRS, mapped to the test cases that verify it (full matrix in §13).</p>" + table(["Req ID", "Feature", "Test case(s)", "Type"], rows)
    b += "<h2>3.1 Security features</h2>" + table(["Security req", "Feature", "Test case(s)"], [[s[0], s[1], s[5]] for s in SECREQS])
    b += """<h1>4. Features not to be Tested</h1><ul><li>PostgreSQL engine internals, the SMTP provider's delivery and the hosting platform's internals (assumed correct; EMS's own use of them is tested).</li><li>TLS configuration and storage encryption of the hosting platform — not independently scannable locally (SEC_06 recorded “Not run”).</li><li>Cross-browser rendering on Safari and Edge, and the first-time-user usability study (needs real participants/devices) — recorded as not executed in NFT_08.</li><li>Native mobile apps, payments and external calendar integration (out of scope in the SRS).</li><li>Production uptime (99.5%) — needs a month of monitoring.</li></ul>
<h1>5. Test Approach / Strategy</h1><h2>Levels</h2>""" + table(["Level", "ID prefix", "What it exercises", "Tooling"], [["Unit", "UT_", "A single function/validation rule in isolation", "node:test (tsx), in-memory/mocked Prisma where noted"], ["Integration", "IT_", "A route + business logic + real PostgreSQL", "node:test against Postgres (CI service container)"], ["System", "ST_", "A user-facing flow across requests/roles", "node:test route handlers; live scripts against a running production build; manual UI walkthrough where noted"], ["Acceptance", "—", "SRS acceptance criteria and exit criteria", "This plan §14"]])
    b += """<h2>Types</h2><ul><li>Functional (60 FR cases, §5.2) · Regression (270 automated tests on every push/PR) · Performance/concurrency (§5.3) · Security (§5.1) · Accessibility (axe-core) · Recovery drill (pg_dump/pg_restore)</li></ul>
<p><b>Entry criteria:</b> stable build on main, test database available, test data seeded. <b>Exit criteria:</b> 100% of planned cases executed or explicitly recorded as not run with reason; all High-priority FRs pass; every failed or partial case has a documented deviation (SAD 4.6).</p>"""
    b += "<h2>5.1 Security Validation</h2><p>Each case traces to a security requirement (SR-xxx) and SRSec section. Results are from the 13 Nov 2026 run.</p>"
    b += table(["ID", "SRSec §", "Security requirement", "Test description", "Result", "Evidence"], [[s[0], s[1], ", ".join(s[5]), s[2], res(s[3]), s[4]] for s in SEC], raw_cols=(4,))
    cnt = lambda r: sum(1 for s in SEC if s[3] == r)
    b += f"<p>Security summary: {cnt('Pass')} Pass · {cnt('Partial')} Partial · {cnt('Fail')} Fail · {cnt('Not run')} Not run (of {len(SEC)}). The failed/partial cases are tracked as deviations D3–D5 and D8–D9 in SAD 4.6.</p>"
    b += "<h2>5.2 Functional Test Cases</h2><p>60 cases (6 per FR: 2 unit, 2 integration, 2 system). “Run” = <b>A</b> automated/live re-run on 13 Nov 2026, <b>M</b> manual UI walkthrough (4 Nov; not re-run). Full IDs have the form <code>FR001-UT_01</code>.</p>"
    for parent, cases in TESTS.items():
        t = [f for f in FRS if f[0].startswith(parent)][0][1] if False else parent
        names = {"FR-001": "Account Registration & Email Verification", "FR-002": "Login & Password Reset", "FR-003": "RBAC, Profile & Admin Account Management", "FR-004": "Event Creation & Update", "FR-005": "Event Cancellation & Notifications", "FR-006": "Discovery, Search, Filtering & Categories", "FR-007": "Event Registration & Duplicate Prevention", "FR-008": "Seat Capacity Check & Concurrency", "FR-009": "Waitlist, Self-Cancellation & Notifications", "FR-010": "Reporting, Export & Statistics"}
        rows = [[fid(parent, c[0]), c[1], c[2], ", ".join(c[3]), c[4], c[5], "Pass"] for c in cases]
        b += f"<h3>{parent} — {e(names[parent])}</h3>" + table(["Test ID", "Description", "Expected result", "Req", "Run", "Verified by", "Result"], rows, raw_cols=(6,)).replace("<td>Pass</td>", '<td><span class="pass">Pass</span></td>')
    b += "<h2>5.3 Non-Functional Test Cases</h2>" + table(["ID", "NFR", "Description", "Result", "Evidence"], [[n[0], n[1], n[2], res(n[3]), n[4]] for n in NFT], raw_cols=(3,))
    b += """<h1>6. Test Environment</h1>""" + table(["Element", "Detail"], [["Runtime", "Node.js 22 (CI: Node 20), TypeScript, Next.js 14.2 App Router, Prisma 5.22"], ["Database", "PostgreSQL 16 (Docker) — real database, never a mock for concurrency cases; separate throw-away databases for the test, load and restore runs"], ["Mail", "nodemailer jsonTransport in test (no real send)"], ["CI", "GitHub Actions (.github/workflows/ci.yml): typecheck, npm test, coverage, production build"], ["Load/restore host", "One Linux laptop running app, PostgreSQL and the load generator together (pessimistic for latency)"], ["Tools", "tsx --test, Node fetch load script, axe-core 4.10.2 + puppeteer-core with Chrome, pg_dump/pg_restore, GitHub Issues/Projects"], ["Test data", "Seeded: 10,000 users, 1,000 events, 100,000 registrations (load); generated test users per run"]])
    b += """<h1>7. Test Schedule</h1>""" + table(["Milestone", "Date"], [["Sprint 1 (test case design and first execution)", "19 Oct – 25 Oct 2026"], ["Sprint 2 (automated suite, CI, Test Plan v2)", "26 Oct – 31 Oct 2026; plan issued 4 Nov"], ["Sprint 3 (NFR work and final re-execution)", "4 Nov – 10 Nov 2026"], ["Full re-run incl. load, recovery, accessibility, security", "13 Nov 2026"]])
    b += """<h1>8. Test Deliverables</h1><ul><li>This Test Plan and Documents/TEST-CASE_DOCUMENT.pdf (Sprint 1 execution log)</li><li>Automated tests: tests/*.test.ts (270) and scripts/test_fr*.ts (74 live checks)</li><li>Reports (docs/reports/): test-run.txt, coverage-report.txt, live-api-test-run.txt, fault-injection/ (fail→fix demonstration)</li><li>Documents/TRACEABILITY_MATRICES.pdf (SRS→Test and Security→Test lists)</li><li>Defect/gap list: SAD 4.6 and GitHub issues</li></ul>
<h1>9. Roles and Responsibilities</h1>""" + table(["Role", "Name", "Responsibility"], [["QA / Test Lead", "Amogh Herle (PES1UG24CS653)", "Plan, execute and report; owns FR-001–003 and security tests"], ["Test Engineer / Developer", "Shravani Mallur (PES1UG24CS621)", "Events and notifications tests (FR-004–006), accessibility (NFR-006)"], ["Test Engineer / Developer", "Arjun Bhat (PES1UG24CS655)", "Registration, concurrency and reporting tests (FR-007–010)"], ["Product Owner / Approver", "Repository owner and course coordinator", "Review PRs, approve results and sign off"]])
    b += """<h1>10. Risks and Mitigation</h1>""" + table(["Risk", "Mitigation"], [["Concurrency defects invisible to mocks", "Run concurrency cases against real PostgreSQL; verified at 100 concurrent requests"], ["Local load test not representative of production", "Report numbers with caveats; repeat on a staging deployment"], ["Unreviewed merges break main", "CI on every PR; reverts #52–#54; require review before merge"], ["Uncommitted local changes diverge from main", "Results are for main; local WIP flagged separately (SEC_03, SEC_10)"], ["No human participants for usability study", "Recorded as not executed; schedule a session"]])
    b += """<h1>11. Assumptions &amp; Dependencies</h1><ul><li>PostgreSQL 16 and Node are available to run the suite; CI service container is healthy.</li><li>Test accounts and data are generated per run; no production data is used.</li><li>SMTP is replaced by jsonTransport in tests.</li><li>Hosting platform provides TLS and storage encryption as documented.</li></ul>
<h1>12. Suspension &amp; Resumption Criteria</h1><p><b>Suspend</b> if the CI pipeline or Postgres service cannot start (blocks all IT_/ST_ cases), or the build is too unstable (blocks &gt;30% of cases). <b>Resume</b> when the blocking defect or environment issue is fixed; previously passing cases are re-run only if the fix touched code they exercise.</p>
<h1 class="pb">13. Test Case Management &amp; Traceability</h1><p>RTM maps every SRS requirement to its test cases (forward) and every test case group back to its requirement (reverse). The separate printable lists are in Documents/TRACEABILITY_MATRICES.pdf.</p><h2>13.1 SRS → Test (forward)</h2>"""
    rows = []
    for f in FRS: rows.append([f[0], f[1], ", ".join(tm.get(f[0], [])), "Pass"])
    for n in NFRS:
        rs = [x for x in NFT if x[1] == n[0]]
        sec = {"NFR-003": ["SEC_01", "SEC_06", "SEC_12"], "NFR-004": ["SEC_03", "SEC_04", "SEC_05", "SEC_09", "SEC_10", "SEC_11", "SEC_13"]}.get(n[0], [])
        worst = "Fail" if any(x[3] == "Fail" for x in rs) else ("Partial" if any(x[3] == "Partial" for x in rs) else "Pass")
        if n[0] == "NFR-004": worst = "Partial"
        rows.append([n[0], n[2], ", ".join([x[0] for x in rs] + sec), worst])
    b += table(["Req ID", "Requirement", "Test case(s)", "Overall result"], [[r[0], r[1], r[2], res(r[3])] for r in rows], raw_cols=(3,))
    b += "<h2>13.2 Security requirement → Test</h2>" + table(["Security req", "SRSec §", "Test case(s)", "Result"], [[s[0], s[2], s[5], res(s[6])] for s in SECREQS], raw_cols=(3,))
    b += f"""<h1>14. Test Metrics &amp; Reporting</h1>""" + table(["Metric", "Value (13 Nov 2026)"], [["Automated tests (tests/*.test.ts, 15 files)", f"{STATS['auto_pass']} / {STATS['auto_total']} pass, 0 fail"], ["Live API checks (scripts/test_fr*.ts, 6 scripts)", f"{STATS['live_pass']} / {STATS['live_total']} pass, 0 fail"], ["Functional cases (§5.2)", f"60 / 60 Pass ({STATS['func_auto']} verified by automated re-run today, {STATS['func_manual']} manual UI cases carried from 4 Nov)"], ["Non-functional cases (§5.3)", f"{n_pass} Pass · {sum(1 for n in NFT if n[3]=='Partial')} Partial · {sum(1 for n in NFT if n[3]=='Fail')} Fail (of {len(NFT)})"], ["Security validation (§5.1)", f"{s_pass} Pass · {cnt('Partial')} Partial · {cnt('Fail')} Fail · {cnt('Not run')} Not run (of {len(SEC)})"], ["Line coverage", f"{STATS['coverage']} overall; core modules ≥ 92% (NFR-007 target 80%)"], ["Requirement coverage", "20/20 FRs and 7/7 NFRs have at least one executed test case; 12/12 security requirements mapped"], ["Fail → fix demonstration", "3 injected faults: 250/270 pass (20 fail), after correction 270/270 (docs/reports/fault-injection/)"]])
    b += """<h2>Open items (not silently marked Pass)</h2><ul><li><b>NFT_02</b> latency at 500 concurrent users fails (D2).</li><li><b>SEC_03, SEC_10, SEC_11, SEC_13</b> fail; <b>SEC_09</b> partial (D3–D5, D8).</li><li><b>NFT_08/NFT_11</b> usability study not run; 320 px overflow on main (D7).</li><li><b>NFT_07</b> daily backup and uptime monitoring not configured (D6); <b>SEC_06</b> not independently run (D9).</li></ul>
<p><b>Reports:</b> daily execution status via CI; final summary is this section and docs/reports/.</p>
<h1>15. Approvals</h1>""" + table(["Role", "Name", "Signature / Date"], [["QA Lead", "Amogh Herle", ""], ["Dev Lead", "Shravani Mallur / Arjun Bhat", ""], ["Product Owner / Course Coordinator", "", ""]])
    return page("Test Plan", b)

# --------------------------------------------------------------------------- traceability
def build_trace():
    tm = tests_for()
    b = f'<h1 class="t" style="margin-top:10px">Traceability Matrices</h1><p class="sub">Event Management System — generated {DATE} from the same data as the SRS and Test Plan</p>'
    b += "<h1>List 1 — SRS requirement → test case (forward trace)</h1><p>Test IDs: functional <code>FRnnn-UT/IT/ST_nn</code> (Test Plan §5.2), non-functional <code>NFT_nn</code> (§5.3), security <code>SEC_nn</code> (§5.1).</p>"
    rows = []
    for f in FRS:
        ids = tm.get(f[0], [])
        rows.append([f[0], f[1], f[10], f[11], f"#{f[6]}", ", ".join(ids), str(len(ids)), "Pass"])
    b += "<h2>Functional requirements</h2>" + table(["Req", "Title", "SAD component", "Module", "Issue", "Test cases", "#", "Result"], [r[:7] + [res(r[7])] for r in rows], raw_cols=(7,))
    nr = []
    for n in NFRS:
        rs = [x for x in NFT if x[1] == n[0]]
        sec = {"NFR-003": ", SEC_01, SEC_06, SEC_12", "NFR-004": ", SEC_03, SEC_04, SEC_05, SEC_09, SEC_10, SEC_11, SEC_13"}.get(n[0], "")
        worst = "Fail" if any(x[3] == "Fail" for x in rs) else ("Partial" if any(x[3] == "Partial" for x in rs) else "Pass")
        if n[0] == "NFR-004": worst = "Partial"
        nr.append([n[0], n[1], ", ".join(x[0] for x in rs) + sec, "; ".join(f"{x[0]} {x[3]}" for x in rs), res(worst)])
    b += "<h2>Non-functional requirements</h2>" + table(["Req", "Category", "Test cases", "Per-test results", "Overall"], nr, raw_cols=(4,))
    b += "<h2>Coverage check</h2><p>20 of 20 FRs and 7 of 7 NFRs have at least one test case. Every one of the 60 functional cases maps to at least one FR; no FR has fewer than 1 case (minimum 2: FR-006a, FR-009a/b share cases with siblings as shown).</p>"
    b += '<h1 class="pb">List 2 — Security requirement → test case (SRSec → SR → SEC)</h1>'
    sr = []
    secmap = {s[0]: s for s in SEC}
    for q in SECREQS:
        tests = [t.strip() for t in q[5].split(",")]
        sr.append([q[0], q[2], q[1], q[3] + " / " + q[4], ", ".join(tests), "; ".join(f"{t} {secmap[t][3]}" for t in tests), res(q[6])])
    b += table(["Req", "SRSec §", "Requirement", "Objective / NFR", "Test case(s)", "Test results", "Status in main"], sr, raw_cols=(6,))
    b += "<h2>Security test cases</h2>" + table(["ID", "SRSec §", "Requirement(s)", "Description", "Result", "Evidence"], [[s[0], s[1], ", ".join(s[5]), s[2], res(s[3]), s[4]] for s in SEC], raw_cols=(4,))
    b += '<div class="note">Failing or partial security items (SEC_03, SEC_09, SEC_10, SEC_11, SEC_13) are documented deviations D3, D4, D5, D8 in SAD 4.6. SEC_13 (demo role header accepted without a session) was discovered during this review.</div>'
    return page("Traceability Matrices", b)

def render(name, html_text, pdf):
    p = os.path.join(HERE, name + ".html")
    open(p, "w").write(html_text)
    subprocess.run(["google-chrome", "--headless=new", "--no-sandbox", "--disable-gpu", "--allow-file-access-from-files", "--no-pdf-header-footer", f"--print-to-pdf={os.path.join(OUT, pdf)}", "file://" + p], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("wrote", pdf)

if __name__ == "__main__":
    render("SRS", build_srs(), "SRS_DOCUMENT.pdf")
    render("SAD", build_sad(), "SAD_DOCUMENT.pdf")
    render("TESTPLAN", build_tp(), "TEST-PLAN_DOCUMENT.pdf")
    render("TRACEABILITY", build_trace(), "TRACEABILITY_MATRICES.pdf")
