/**
 * Participant export utilities (CSV and PDF) for FR-010a.
 * Supports multi-page PDF generation with zero external binary dependencies,
 * fast performance conforming to NFR-001 (up to 5,000 records in <10s),
 * and RFC 4180 compliant CSV generation.
 */

export interface ParticipantExportItem {
  id: string;
  userId: string;
  name: string;
  email: string;
  status: string; // e.g. "confirmed" | "waitlisted" | "cancelled"
  registeredAt: Date | string;
  waitlistPosition?: number | null;
}

export interface EventExportInfo {
  id: string;
  name: string;
  date: Date | string;
  time?: string;
  venue?: string;
  category?: string;
  capacity: number;
  confirmedCount: number;
  availableSeats: number;
  waitlistCount?: number;
  status?: string;
  organizerName?: string;
}

/**
 * Escapes a single CSV value according to RFC 4180:
 * Encloses in quotes if it contains commas, double quotes, or newlines.
 * Escapes internal double quotes by doubling them ("").
 *
 * Also guards against CSV/formula injection: a value starting with =, +,
 * -, @, or a tab/CR gets reinterpreted as a formula by Excel/Sheets when
 * the file is opened, so participant-controlled fields (name, email) are
 * neutralized by prefixing a single quote before that check runs.
 */
export function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  let str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates an RFC 4180 compliant CSV string of participants.
 */
export function exportParticipantsToCSV(
  participants: ParticipantExportItem[],
  event?: Partial<EventExportInfo>
): string {
  const headers = ["#", "Name", "Email", "Status", "Registration Date", "Waitlist Position"];
  const rows: string[][] = [];

  participants.forEach((p, index) => {
    const regDateStr =
      p.registeredAt instanceof Date
        ? p.registeredAt.toISOString()
        : String(p.registeredAt || "");

    const waitlistPosStr =
      p.waitlistPosition !== undefined && p.waitlistPosition !== null
        ? String(p.waitlistPosition)
        : "-";

    rows.push([
      String(index + 1),
      p.name || "",
      p.email || "",
      (p.status || "CONFIRMED").toUpperCase(),
      regDateStr,
      waitlistPosStr,
    ]);
  });

  const lines: string[] = [];

  // Optional metadata header comment lines if event info is provided
  // However, standard spreadsheet imports prefer header on line 1.
  // We keep the first line as column headers so automated tools and spreadsheets parse it seamlessly.
  lines.push(headers.map(escapeCsvField).join(","));

  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(","));
  }

  return lines.join("\r\n") + "\r\n";
}

/**
 * Escapes text for PDF literal strings enclosed in parentheses (...).
 * Characters '(', ')', and '\' must be escaped with a backslash.
 *
 * The document declares /Encoding /WinAnsiEncoding on its fonts and the
 * final buffer is written out latin1 (see exportParticipantsToPDF), so a
 * character in the U+00A0-U+00FF range is passed through as-is: WinAnsi
 * and Unicode agree on that range, and encoding the string latin1 writes
 * each of those code points out as the single byte the font expects —
 * e.g. "José"/"Zoë" render correctly instead of "Jos?"/"Zo?". Anything
 * outside Latin-1 (CJK, emoji, etc.) still has no glyph in this base-14
 * font and falls back to "?".
 */
function escapePdfText(str: string): string {
  if (!str) return "";
  return str
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, (ch) => {
      // Map common curly quotes or dashes to ASCII
      if (ch === "“" || ch === "”") return '"';
      if (ch === "‘" || ch === "’") return "'";
      if (ch === "–" || ch === "—") return "-";
      const code = ch.charCodeAt(0);
      if (code >= 0xa0 && code <= 0xff) return ch;
      return "?";
    });
}

/**
 * Truncates text to a maximum character length, appending ellipsis if needed.
 */
function truncateText(str: string, maxLen: number): string {
  if (!str) return "";
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}

/**
 * Generates a clean, multi-page PDF document representing the participant roster.
 * Adheres strictly to the PDF-1.4 specification with standard Helvetica fonts,
 * cross-reference table, and trailer.
 */
export function exportParticipantsToPDF(
  participants: ParticipantExportItem[],
  event: EventExportInfo
): Buffer {
  const PAGE_WIDTH = 612; // 8.5 inches
  const PAGE_HEIGHT = 792; // 11 inches
  const MARGIN_LEFT = 40;
  const MARGIN_RIGHT = 572;
  const MARGIN_BOTTOM = 45;
  const ROWS_PER_FIRST_PAGE = 22; // First page has event metadata header
  const ROWS_PER_SUBSEQUENT_PAGE = 32;

  // Split participants into pages
  const pagesData: ParticipantExportItem[][] = [];
  if (participants.length === 0) {
    pagesData.push([]);
  } else {
    let remaining = [...participants];
    pagesData.push(remaining.slice(0, ROWS_PER_FIRST_PAGE));
    remaining = remaining.slice(ROWS_PER_FIRST_PAGE);

    while (remaining.length > 0) {
      pagesData.push(remaining.slice(0, ROWS_PER_SUBSEQUENT_PAGE));
      remaining = remaining.slice(ROWS_PER_SUBSEQUENT_PAGE);
    }
  }

  const totalPages = pagesData.length;
  const pageStreamContents: string[] = [];

  const eventDateStr =
    event.date instanceof Date
      ? event.date.toLocaleDateString("en-US", { dateStyle: "medium" })
      : String(event.date || "").slice(0, 10);

  let globalIndex = 0;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const pageItems = pagesData[pageNum - 1];
    let stream = "";

    // ── Header ───────────────────────────────────────────────
    if (pageNum === 1) {
      // Document Title
      stream += `BT /F2 18 Tf ${MARGIN_LEFT} 740 Td (${escapePdfText(truncateText(event.name || "Event Participant List", 45))}) Tj ET\n`;
      stream += `BT /F1 10 Tf ${MARGIN_LEFT} 722 Td (${escapePdfText("Participant Roster & Registration Report")}) Tj ET\n`;

      // Status pill badge on right
      const statusText = (event.status || "ACTIVE").toUpperCase();
      stream += `0.92 0.94 0.98 rg 490 732 80 20 re f\n`;
      stream += `BT /F2 9 Tf 502 738 Td (${escapePdfText(statusText)}) Tj ET\n`;

      // Horizontal separator rule
      stream += `0.85 0.85 0.85 RG 1 w ${MARGIN_LEFT} 710 m ${MARGIN_RIGHT} 710 l S\n`;

      // Meta grid box
      stream += `0.97 0.97 0.97 rg ${MARGIN_LEFT} 635 532 65 re f\n`;
      stream += `0.88 0.88 0.88 RG 0.75 w ${MARGIN_LEFT} 635 532 65 re S\n`;

      // Meta row 1: Date & Time | Venue
      stream += `BT /F2 9 Tf ${MARGIN_LEFT + 12} 683 Td (Date & Time:) Tj ET\n`;
      stream += `BT /F1 9 Tf ${MARGIN_LEFT + 75} 683 Td (${escapePdfText(`${eventDateStr} ${event.time ? " · " + event.time : ""}`)}) Tj ET\n`;

      stream += `BT /F2 9 Tf 320 683 Td (Venue:) Tj ET\n`;
      stream += `BT /F1 9 Tf 365 683 Td (${escapePdfText(truncateText(event.venue || "TBD", 30))}) Tj ET\n`;

      // Meta row 2: Capacity | Registered | Available Seats
      stream += `BT /F2 9 Tf ${MARGIN_LEFT + 12} 665 Td (Total Capacity:) Tj ET\n`;
      stream += `BT /F1 9 Tf ${MARGIN_LEFT + 85} 665 Td (${event.capacity} seats) Tj ET\n`;

      stream += `BT /F2 9 Tf 200 665 Td (Registered:) Tj ET\n`;
      stream += `BT /F1 9 Tf 260 665 Td (${event.confirmedCount} participants) Tj ET\n`;

      stream += `BT /F2 9 Tf 370 665 Td (Available Seats:) Tj ET\n`;
      stream += `BT /F1 9 Tf 450 665 Td (${event.availableSeats}) Tj ET\n`;

      // Meta row 3: Category | Waitlisted | Generated At
      if (event.category) {
        stream += `BT /F2 9 Tf ${MARGIN_LEFT + 12} 647 Td (Category:) Tj ET\n`;
        stream += `BT /F1 9 Tf ${MARGIN_LEFT + 65} 647 Td (${escapePdfText(event.category)}) Tj ET\n`;
      }
      if (event.waitlistCount !== undefined && event.waitlistCount > 0) {
        stream += `BT /F2 9 Tf 200 647 Td (Waitlisted:) Tj ET\n`;
        stream += `BT /F1 9 Tf 260 647 Td (${event.waitlistCount}) Tj ET\n`;
      }
      stream += `BT /F1 8 Tf 370 647 Td (Report Date: ${escapePdfText(new Date().toISOString().slice(0, 10))}) Tj ET\n`;

      var tableStartY = 610;
    } else {
      // Subsequent page compact header
      stream += `BT /F2 11 Tf ${MARGIN_LEFT} 750 Td (${escapePdfText(truncateText(event.name, 40))} - Participant Roster (Cont.)) Tj ET\n`;
      stream += `0.85 0.85 0.85 RG 0.75 w ${MARGIN_LEFT} 742 m ${MARGIN_RIGHT} 742 l S\n`;
      var tableStartY = 725;
    }

    // ── Table Header ─────────────────────────────────────────
    // Column x coordinates
    // # (30px), Name (140px), Email (180px), Status (70px), Registered At (112px)
    const colX = {
      num: MARGIN_LEFT + 6,
      name: MARGIN_LEFT + 32,
      email: MARGIN_LEFT + 175,
      status: MARGIN_LEFT + 355,
      date: MARGIN_LEFT + 435,
    };

    // Header background bar
    stream += `0.92 0.94 0.96 rg ${MARGIN_LEFT} ${tableStartY - 18} 532 18 re f\n`;
    stream += `0.82 0.84 0.88 RG 0.5 w ${MARGIN_LEFT} ${tableStartY - 18} 532 18 re S\n`;

    stream += `BT /F2 9 Tf ${colX.num} ${tableStartY - 13} Td (#) Tj ET\n`;
    stream += `BT /F2 9 Tf ${colX.name} ${tableStartY - 13} Td (Participant Name) Tj ET\n`;
    stream += `BT /F2 9 Tf ${colX.email} ${tableStartY - 13} Td (Email Address) Tj ET\n`;
    stream += `BT /F2 9 Tf ${colX.status} ${tableStartY - 13} Td (Status) Tj ET\n`;
    stream += `BT /F2 9 Tf ${colX.date} ${tableStartY - 13} Td (Registration Date) Tj ET\n`;

    let rowY = tableStartY - 34;

    if (pageItems.length === 0 && pageNum === 1) {
      stream += `BT /F1 10 Tf ${MARGIN_LEFT + 160} ${rowY - 10} Td (No participants registered for this event yet.) Tj ET\n`;
    } else {
      for (const item of pageItems) {
        globalIndex++;
        const isEven = globalIndex % 2 === 0;

        // Alternating row background
        if (isEven) {
          stream += `0.98 0.98 0.98 rg ${MARGIN_LEFT} ${rowY - 4} 532 16 re f\n`;
        }

        // Row underline
        stream += `0.90 0.90 0.90 RG 0.5 w ${MARGIN_LEFT} ${rowY - 4} m ${MARGIN_RIGHT} ${rowY - 4} l S\n`;

        const pName = truncateText(item.name || "Unknown", 25);
        const pEmail = truncateText(item.email || "", 30);
        const pStatus = (item.status || "CONFIRMED").toUpperCase();
        const pDate =
          item.registeredAt instanceof Date
            ? item.registeredAt.toISOString().slice(0, 16).replace("T", " ")
            : String(item.registeredAt || "").slice(0, 16).replace("T", " ");

        stream += `BT /F1 8.5 Tf ${colX.num} ${rowY} Td (${globalIndex}) Tj ET\n`;
        stream += `BT /F2 8.5 Tf ${colX.name} ${rowY} Td (${escapePdfText(pName)}) Tj ET\n`;
        stream += `BT /F1 8.5 Tf ${colX.email} ${rowY} Td (${escapePdfText(pEmail)}) Tj ET\n`;

        // Color status text: green for confirmed, amber for waitlist, red for cancel
        if (pStatus === "CONFIRMED") {
          stream += `0.1 0.5 0.2 rg BT /F2 8 Tf ${colX.status} ${rowY} Td (${escapePdfText(pStatus)}) Tj ET 0 g\n`;
        } else if (pStatus === "WAITLISTED") {
          const waitPos = item.waitlistPosition ? `#${item.waitlistPosition}` : "";
          stream += `0.7 0.4 0.0 rg BT /F2 8 Tf ${colX.status} ${rowY} Td (${escapePdfText(`WAITLIST ${waitPos}`.trim())}) Tj ET 0 g\n`;
        } else {
          stream += `0.6 0.2 0.2 rg BT /F1 8 Tf ${colX.status} ${rowY} Td (${escapePdfText(pStatus)}) Tj ET 0 g\n`;
        }

        stream += `BT /F1 8 Tf ${colX.date} ${rowY} Td (${escapePdfText(pDate)}) Tj ET\n`;

        rowY -= 17;
      }
    }

    // ── Footer ───────────────────────────────────────────────
    stream += `0.85 0.85 0.85 RG 0.5 w ${MARGIN_LEFT} ${MARGIN_BOTTOM + 12} m ${MARGIN_RIGHT} ${MARGIN_BOTTOM + 12} l S\n`;
    stream += `BT /F1 8 Tf ${MARGIN_LEFT} ${MARGIN_BOTTOM} Td (Event Management System · Confidential Organizer Report) Tj ET\n`;
    stream += `BT /F1 8 Tf ${MARGIN_RIGHT - 65} ${MARGIN_BOTTOM} Td (Page ${pageNum} of ${totalPages}) Tj ET\n`;

    pageStreamContents.push(stream);
  }

  // ── Build PDF Object Graph ────────────────────────────────
  // Object IDs:
  // 1: Catalog
  // 2: Pages container
  // 3: Font Helvetica
  // 4: Font Helvetica-Bold
  // For each page i (0-based):
  //   Obj (5 + i*2): Content stream
  //   Obj (6 + i*2): Page definition
  const objects: string[] = [];

  // Obj 1: Catalog
  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`);

  // Obj 2: Pages tree (placeholder, resolved after we know page obj IDs)
  const pageObjIds: number[] = [];
  for (let i = 0; i < totalPages; i++) {
    pageObjIds.push(6 + i * 2);
  }
  const pagesKidsStr = pageObjIds.map((id) => `${id} 0 R`).join(" ");
  objects.push(`<< /Type /Pages /Kids [ ${pagesKidsStr} ] /Count ${totalPages} >>`);

  // Obj 3: Font Helvetica (WinAnsiEncoding so the Latin-1 bytes escapePdfText
  // passes through for accented characters render as the intended glyph)
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);

  // Obj 4: Font Helvetica-Bold
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);

  // Page stream and page objects
  for (let i = 0; i < totalPages; i++) {
    const streamBody = pageStreamContents[i];
    const streamLen = Buffer.byteLength(streamBody, "latin1");
    const streamObj = `<< /Length ${streamLen} >>\nstream\n${streamBody}\nendstream`;
    objects.push(streamObj); // Obj 5 + i*2

    const pageObj = `<<
  /Type /Page
  /Parent 2 0 R
  /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}]
  /Contents ${5 + i * 2} 0 R
  /Resources <<
    /Font <<
      /F1 3 0 R
      /F2 4 0 R
    >>
  >>
>>`;
    objects.push(pageObj); // Obj 6 + i*2
  }

  // Assemble full PDF
  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [0];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const startXref = Buffer.byteLength(pdf, "latin1");
  pdf += "xref\n";
  pdf += `0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    const offsetStr = String(offsets[i]).padStart(10, "0");
    pdf += `${offsetStr} 00000 n \n`;
  }

  pdf += "trailer\n";
  pdf += `<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += "startxref\n";
  pdf += `${startXref}\n`;
  pdf += "%%EOF\n";

  return Buffer.from(pdf, "latin1");
}
